"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  Pencil,
  AlertTriangle,
  BarChart2,
} from "lucide-react"
import { toast } from "sonner"
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts"
import { upsertInvestment, deleteInvestment, deleteAllInvestments, bulkUpsertInvestments, refreshPrices } from "@/app/investments/actions"
import { PlaidInvestmentsConnect } from "./plaid-investments-connect"
import { ConnectedBrokerages } from "./connected-brokerages"
import { MarketPulse } from "./market-pulse"
import { MarketNews } from "./market-news"
import { AnalystRatings } from "./analyst-ratings"


interface Investment {
  id: string
  symbol: string
  name: string | null
  shares: number
  avg_cost: number
  current_price: number | null
  sector: string | null
  asset_type: string
  updated_at: string
}

const SECTORS = ["Technology", "Healthcare", "Finance", "Energy", "Consumer", "Industrials", "Real Estate", "Utilities", "Materials", "Communication", "Other"]
const ASSET_TYPES = ["stock", "etf", "crypto", "mutual fund", "option"]

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

// Parse Webull CSV exports (positions or transaction history)
function parseWebullCsv(text: string): Array<{ symbol: string; name?: string; shares: number; avg_cost: number; current_price?: number }> {
  const lines = text.trim().split("\n").filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase())

  // Detect format
  const hasQty = headers.some((h) => h.includes("qty") || h.includes("quantity") || h.includes("shares"))
  const hasAvgCost = headers.some((h) => h.includes("avg") || h.includes("cost") || h.includes("average"))
  const hasSide = headers.some((h) => h === "side" || h === "action" || h === "type")

  if (!hasQty) throw new Error("Could not find a Qty/Shares column. Make sure you're exporting Positions from Webull.")

  // Map column names
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.includes(n))
      if (idx !== -1) return idx
    }
    return -1
  }

  const symIdx = col(["symbol", "ticker"])
  const nameIdx = col(["name", "description", "security"])
  const qtyIdx = col(["qty", "quantity", "shares"])
  const avgIdx = col(["avg cost", "avg. cost", "average cost", "cost basis", "price"])
  const priceIdx = col(["current price", "last price", "market price", "close"])
  const sideIdx = col(["side", "action", "type"])

  if (symIdx === -1) throw new Error("No Symbol column found")
  if (qtyIdx === -1) throw new Error("No Quantity/Shares column found")

  const results = new Map<string, { symbol: string; name?: string; shares: number; avg_cost: number; current_price?: number }>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/"/g, "").trim())
    const symbol = cols[symIdx]?.toUpperCase()
    if (!symbol || symbol === "SYMBOL" || symbol === "") continue

    const rawQty = parseFloat(cols[qtyIdx]?.replace(/[^0-9.-]/g, "") ?? "0")
    const rawPrice = avgIdx !== -1 ? parseFloat(cols[avgIdx]?.replace(/[^0-9.-]/g, "") ?? "0") : 0
    const rawCurrent = priceIdx !== -1 ? parseFloat(cols[priceIdx]?.replace(/[^0-9.-]/g, "") ?? "0") : undefined
    const name = nameIdx !== -1 ? cols[nameIdx] : undefined
    const side = sideIdx !== -1 ? cols[sideIdx]?.toLowerCase() : undefined

    if (isNaN(rawQty) || rawQty === 0) continue

    if (hasSide) {
      // Transaction history — aggregate buys/sells
      const existing = results.get(symbol)
      const qty = side === "sell" ? -rawQty : rawQty
      if (existing) {
        const totalCost = existing.avg_cost * existing.shares + rawPrice * qty
        const newShares = existing.shares + qty
        results.set(symbol, {
          ...existing,
          shares: newShares,
          avg_cost: newShares > 0 ? totalCost / newShares : 0,
        })
      } else {
        results.set(symbol, { symbol, name, shares: qty, avg_cost: rawPrice, current_price: rawCurrent })
      }
    } else {
      // Positions snapshot — one row per holding
      results.set(symbol, {
        symbol,
        name,
        shares: rawQty,
        avg_cost: rawPrice,
        current_price: rawCurrent && rawCurrent > 0 ? rawCurrent : undefined,
      })
    }
  }

  return Array.from(results.values()).filter((r) => r.shares > 0)
}

interface Props {
  initialInvestments: Investment[]
}

export function InvestmentsContent({ initialInvestments }: Props) {
  const router = useRouter()
  const [investments, setInvestments] = useState<Investment[]>(initialInvestments)
  const [open, setOpen] = useState(false)
  const [editingInv, setEditingInv] = useState<Investment | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [isDeletingAll, startDeletingAll] = useTransition()
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseWebullCsv> | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, startRefreshing] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // Portfolio history for line chart
  const [history, setHistory] = useState<Array<{ date: string; label: string; value: number }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRange, setHistoryRange] = useState<"1d" | "30d" | "6m" | "1y" | "all">("30d")

  useEffect(() => {
    if (investments.length === 0) return
    setHistoryLoading(true)
    fetch(`/api/investments/history?range=${historyRange}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [investments, historyRange])

  // Summary stats
  const totalCost = investments.reduce((s, inv) => s + inv.shares * inv.avg_cost, 0)
  const totalValue = investments.reduce((s, inv) => s + inv.shares * (inv.current_price ?? inv.avg_cost), 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    setCsvPreview(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parseWebullCsv(text)
        if (!parsed.length) {
          setCsvError("No valid holdings found in this CSV. Make sure you're exporting Positions from Webull.")
          return
        }
        setCsvPreview(parsed)
      } catch (err: unknown) {
        setCsvError(err instanceof Error ? err.message : "Failed to parse CSV")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function handleImport() {
    if (!csvPreview?.length) return
    startImporting(async () => {
      const result = await bulkUpsertInvestments(csvPreview)
      if (result.error) { toast.error(result.error); return }
      toast.success(`Imported ${result.count} holding${result.count !== 1 ? "s" : ""}`)
      setCsvOpen(false)
      setCsvPreview(null)
      router.refresh()
    })
  }

  function handleRefresh() {
    startRefreshing(async () => {
      const result = await refreshPrices()
      if ("error" in result) { toast.error(result.error); return }
      toast.success(`Updated prices for ${result.updated} holding${result.updated !== 1 ? "s" : ""}`)
      router.refresh()
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await upsertInvestment(fd)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${fd.get("symbol")} saved`)
      setOpen(false)
      setEditingInv(null)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteInvestment(id)
      if (result.error) { toast.error(result.error); return }
      setInvestments((prev) => prev.filter((i) => i.id !== id))
      setConfirmDeleteId(null)
      router.refresh()
    })
  }

  const dialogForm = (inv?: Investment) => (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="symbol">Ticker Symbol</Label>
          <Input id="symbol" name="symbol" placeholder="e.g. AAPL" defaultValue={inv?.symbol} required className="uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="asset_type">Type</Label>
          <Select name="asset_type" defaultValue={inv?.asset_type ?? "stock"}>
            <SelectTrigger id="asset_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSET_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Company Name <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="name" name="name" placeholder="e.g. Apple Inc." defaultValue={inv?.name ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shares">Shares</Label>
          <Input id="shares" name="shares" type="number" step="0.0001" min="0.0001" placeholder="0" defaultValue={inv?.shares} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avg_cost">Avg Cost / Share ($)</Label>
          <Input id="avg_cost" name="avg_cost" type="number" step="0.01" min="0" placeholder="0.00" defaultValue={inv?.avg_cost} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="current_price">Current Price ($) <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="current_price" name="current_price" type="number" step="0.01" min="0" placeholder="auto-fetch" defaultValue={inv?.current_price ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sector">Sector <span className="text-muted-foreground">(optional)</span></Label>
          <Select name="sector" defaultValue={inv?.sector ?? ""}>
            <SelectTrigger id="sector"><SelectValue placeholder="Select sector" /></SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => { setOpen(false); setEditingInv(null) }}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  )

  const holdingSymbols = investments.map((inv) => inv.symbol)
  const sharesMap = Object.fromEntries(investments.map((inv) => [inv.symbol, inv.shares]))
  const avgCostMap = Object.fromEntries(investments.map((inv) => [inv.symbol, inv.avg_cost]))

  return (
    <div className="space-y-6">
      {/* Market Pulse — live indices */}
      <MarketPulse holdingSymbols={holdingSymbols} />

      {/* News + Analyst Ratings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MarketNews holdingSymbols={holdingSymbols} />
        </div>
        <div>
          <AnalystRatings
            holdingSymbols={holdingSymbols}
            sharesMap={sharesMap}
            avgCostMap={avgCostMap}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Invested</p>
          <p className="text-xl font-bold">{currency(totalCost)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Current Value</p>
          <p className="text-xl font-bold">{currency(totalValue)}</p>
        </Card>
        <Card className={`p-4 ${totalGain >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800"}`}>
          <p className={`text-xs mb-1 ${totalGain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>Total Gain/Loss</p>
          <p className={`text-xl font-bold ${totalGain >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
            {totalGain >= 0 ? "+" : ""}{currency(totalGain)}
          </p>
        </Card>
        <Card className={`p-4 ${totalGainPct >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800"}`}>
          <p className={`text-xs mb-1 ${totalGainPct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>Return</p>
          <p className={`text-xl font-bold flex items-center gap-1 ${totalGainPct >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
            {totalGainPct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {pct(totalGainPct)}
          </p>
        </Card>
      </div>

      {/* Charts */}
      {investments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart A: Cost vs Current Value */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-4">Cost vs. Current Value</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={investments.map((inv) => ({
                  name: inv.symbol,
                  Cost: parseFloat((inv.shares * inv.avg_cost).toFixed(2)),
                  Value: parseFloat((inv.shares * (inv.current_price ?? inv.avg_cost)).toFixed(2)),
                }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={44} />
                <Tooltip
                  formatter={(value: number, name: string) => [currency(value), name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="Cost" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Cost Basis" />
                <Bar dataKey="Value" radius={[3, 3, 0, 0]} name="Current Value">
                  {investments.map((inv, i) => {
                    const gain = inv.shares * (inv.current_price ?? inv.avg_cost) - inv.shares * inv.avg_cost
                    return <Cell key={i} fill={gain >= 0 ? "#22c55e" : "#f43f5e"} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Chart D: Portfolio Value Over Time */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Portfolio Value</p>
              <div className="flex items-center gap-1">
                {historyLoading && <span className="text-xs text-muted-foreground animate-pulse mr-2">Loading…</span>}
                {(["1d", "30d", "6m", "1y", "all"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setHistoryRange(r)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      historyRange === r
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "all" ? "All" : r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={history} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={historyRange === "1d" ? 11 : Math.floor(history.length / 5)}
                  angle={historyRange === "1d" ? 0 : -25}
                  textAnchor={historyRange === "1d" ? "middle" : "end"}
                  height={historyRange === "1d" ? 20 : 40}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  width={52}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(value: number) => [currency(value), "Portfolio Value"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366f1" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!historyLoading && history.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                {historyRange === "1d" ? "No intraday data yet — market may be closed" : "No history available yet"}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh prices */}
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={handleRefresh} disabled={isRefreshing || investments.length === 0}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Prices</span>
          </Button>

          {/* Plaid connect */}
          <PlaidInvestmentsConnect onSuccess={() => router.refresh()} hasBrokerage={true} />

          {/* CSV Import */}
          <Dialog open={csvOpen} onOpenChange={(o) => { setCsvOpen(o); if (!o) { setCsvPreview(null); setCsvError(null) } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Import from Webull CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How to export from Webull:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open Webull app → Portfolio</li>
                    <li>Tap the menu → <strong>Export</strong></li>
                    <li>Select <strong>Positions</strong> (recommended) or Transaction History</li>
                    <li>Save as CSV and upload below</li>
                  </ol>
                </div>

                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm font-medium">Click to upload CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports Webull Positions or Transaction History exports</p>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                </div>

                {csvError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{csvError}</p>
                  </div>
                )}

                {csvPreview && csvPreview.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{csvPreview.length} holding{csvPreview.length !== 1 ? "s" : ""} found:</p>
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                      {csvPreview.map((row) => {
                        const value = row.shares * row.avg_cost
                        return (
                          <div key={row.symbol} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/50">
                            <div>
                              <span className="font-semibold">{row.symbol}</span>
                              {row.name && <span className="text-muted-foreground ml-1.5">{row.name}</span>}
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground">{row.shares} shares @ {currency(row.avg_cost)}</span>
                              {row.current_price && <span className="ml-2 text-primary">now {currency(row.current_price)}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Existing holdings with the same ticker will be updated.</p>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1 bg-transparent" onClick={() => { setCsvPreview(null); setCsvError(null) }}>Clear</Button>
                      <Button className="flex-1" onClick={handleImport} disabled={isImporting}>
                        {isImporting ? "Importing…" : `Import ${csvPreview.length} Holdings`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete all */}
          {investments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear All</span>
            </Button>
          )}

          {/* Add manually */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Holding
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Holding</DialogTitle>
              </DialogHeader>
              {dialogForm()}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Connected brokerages */}
      <ConnectedBrokerages />

      {/* Holdings list */}
      {investments.length === 0 ? (
        <Card className="p-10 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No holdings yet</p>
          <p className="text-xs text-muted-foreground mb-4">Import your Webull positions via CSV or add holdings manually.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <PlaidInvestmentsConnect onSuccess={() => router.refresh()} hasBrokerage={true} />
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setCsvOpen(true)}>
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Add Holding
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {investments.map((inv) => {
            const price = inv.current_price ?? inv.avg_cost
            const value = inv.shares * price
            const cost = inv.shares * inv.avg_cost
            const gain = value - cost
            const gainPct = cost > 0 ? (gain / cost) * 100 : 0
            const hasPrice = inv.current_price != null

            return (
              <Card key={inv.id} className="p-4 group hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${gain >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"}`}>
                    {inv.symbol.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{inv.symbol}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">{inv.asset_type}</Badge>
                      {inv.sector && <Badge variant="outline" className="text-[10px] h-4 px-1.5 hidden sm:inline-flex">{inv.sector}</Badge>}
                    </div>
                    {inv.name && <p className="text-xs text-muted-foreground truncate">{inv.name}</p>}
                    <p className="text-xs text-muted-foreground">
                      {inv.shares} shares · avg {currency(inv.avg_cost)}
                      {hasPrice && <> · now {currency(inv.current_price!)}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{currency(value)}</p>
                    <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {gain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {gain >= 0 ? "+" : ""}{currency(gain)} ({pct(gainPct)})
                    </p>
                    {!hasPrice && <p className="text-[10px] text-muted-foreground">no price data</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingInv(inv)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(inv.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingInv} onOpenChange={(o) => { if (!o) setEditingInv(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingInv?.symbol}</DialogTitle>
          </DialogHeader>
          {editingInv && dialogForm(editingInv)}
        </DialogContent>
      </Dialog>

      {/* Delete ALL confirmation */}
      <Dialog open={confirmDeleteAll} onOpenChange={(o) => { if (!o) setConfirmDeleteAll(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Clear all holdings?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all {investments.length} holdings. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteAll(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={isDeletingAll}
                onClick={() => {
                  startDeletingAll(async () => {
                    const result = await deleteAllInvestments()
                    if (result.error) { toast.error(result.error); return }
                    toast.success("All holdings deleted")
                    setConfirmDeleteAll(false)
                    router.refresh()
                  })
                }}
              >
                {isDeletingAll ? "Deleting…" : "Delete All"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Remove holding?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">This will remove the holding from your portfolio. This cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)} disabled={isPending}>
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
