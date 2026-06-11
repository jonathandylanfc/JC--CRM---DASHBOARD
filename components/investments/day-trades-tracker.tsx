"use client"

import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Upload, Trash2, TrendingUp, TrendingDown, ImageIcon, Loader2, ChevronDown, ChevronRight, Plus, List } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { saveDayTrade, deleteDayTrade, type DayTrade } from "@/app/investments/day-trades-actions"

interface Props {
  initialTrades: DayTrade[]
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

// Futures point value multipliers (P&L per point per contract)
const FUTURES_MULTIPLIERS: Record<string, number> = {
  NQ: 20, MNQ: 2,
  ES: 50, MES: 5,
  RTY: 50, M2K: 5,
  YM: 5, MYM: 0.5,
  CL: 1000, GC: 100, SI: 5000,
}

function getMultiplier(symbol: string): number {
  if (FUTURES_MULTIPLIERS[symbol]) return FUTURES_MULTIPLIERS[symbol]
  for (const [prefix, val] of Object.entries(FUTURES_MULTIPLIERS)) {
    if (symbol.startsWith(prefix)) return val
  }
  return 1
}

interface RoundTrip {
  symbol: string
  entryAction: "buy" | "sell"
  entryPrice: number
  exitPrice: number
  shares: number
  pnl: number
  openedAt: string
  closedAt: string
}

// FIFO matching — returns completed round-trips and any still-open legs
function computeRoundTrips(trades: DayTrade[]): { trips: RoundTrip[]; openLegs: DayTrade[] } {
  const bySymbol: Record<string, DayTrade[]> = {}
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(t)
  }

  const trips: RoundTrip[] = []
  const openLegs: DayTrade[] = []

  for (const [symbol, symTrades] of Object.entries(bySymbol)) {
    const sorted = [...symTrades].sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime())
    const mult = getMultiplier(symbol)

    const openBuys: Array<{ shares: number; price: number; traded_at: string }> = []
    const openSells: Array<{ shares: number; price: number; traded_at: string }> = []

    for (const t of sorted) {
      if (t.action === "buy") {
        // Close any open shorts first
        let rem = t.shares
        while (rem > 0 && openSells.length > 0) {
          const open = openSells[0]
          const matched = Math.min(rem, open.shares)
          trips.push({ symbol, entryAction: "sell", entryPrice: open.price, exitPrice: t.price, shares: matched, pnl: matched * (open.price - t.price) * mult, openedAt: open.traded_at, closedAt: t.traded_at })
          open.shares -= matched; rem -= matched
          if (open.shares <= 0) openSells.shift()
        }
        if (rem > 0) openBuys.push({ shares: rem, price: t.price, traded_at: t.traded_at })
      } else {
        // Close any open longs first
        let rem = t.shares
        while (rem > 0 && openBuys.length > 0) {
          const open = openBuys[0]
          const matched = Math.min(rem, open.shares)
          trips.push({ symbol, entryAction: "buy", entryPrice: open.price, exitPrice: t.price, shares: matched, pnl: matched * (t.price - open.price) * mult, openedAt: open.traded_at, closedAt: t.traded_at })
          open.shares -= matched; rem -= matched
          if (open.shares <= 0) openBuys.shift()
        }
        if (rem > 0) openSells.push({ shares: rem, price: t.price, traded_at: t.traded_at })
      }
    }

    // Remaining unmatched legs = open positions
    for (const o of [...openBuys, ...openSells]) {
      openLegs.push({ ...symTrades[0], shares: o.shares, price: o.price })
    }
  }

  trips.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
  return { trips, openLegs }
}

function computeSymbolTotals(trips: RoundTrip[]) {
  const map: Record<string, { pnl: number; count: number }> = {}
  for (const t of trips) {
    if (!map[t.symbol]) map[t.symbol] = { pnl: 0, count: 0 }
    map[t.symbol].pnl += t.pnl
    map[t.symbol].count++
  }
  return Object.entries(map).map(([symbol, v]) => ({ symbol, ...v }))
}

export function DayTradesTracker({ initialTrades }: Props) {
  const [trades, setTrades] = useState<DayTrade[]>(initialTrades)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [drafts, setDrafts] = useState<Partial<DayTrade>[]>([])
  const [draft, setDraft] = useState<Partial<DayTrade> | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) handleImageUpload(file)
  }

  const isMultiMode = drafts.length > 0

  async function handleImageUpload(file: File) {
    setParsing(true)
    setImagePreview(URL.createObjectURL(file))
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch("/api/investments/parse-trade", { method: "POST", body: fd })
      const data = await res.json()
      if (data.error) { toast.error(data.error); setParsing(false); return }
      const parsed: Partial<DayTrade>[] = (data.trades as Array<Partial<DayTrade>>).map((t) => ({
        symbol: t.symbol ?? "",
        action: t.action ?? "buy",
        shares: t.shares ?? 0,
        price: t.price ?? 0,
        traded_at: t.traded_at ?? new Date().toISOString(),
        notes: t.notes ?? "",
      }))
      setDrafts(parsed)
      setDraft(null)
      setOpen(true)
    } catch {
      toast.error("Failed to parse screenshot")
    } finally {
      setParsing(false)
    }
  }

  async function handleSaveAll() {
    setSaving(true)
    let saved = 0
    for (const d of drafts) {
      if (!d.symbol || !d.action || !d.shares || !d.price || !d.traded_at) continue
      const result = await saveDayTrade({
        symbol: d.symbol.toUpperCase(),
        action: d.action as "buy" | "sell",
        shares: Number(d.shares),
        price: Number(d.price),
        traded_at: new Date(d.traded_at).toISOString(),
        notes: d.notes ?? null,
      })
      if (!result.error && result.trade) { setTrades((prev) => [result.trade!, ...prev]); saved++ }
    }
    setSaving(false)
    setOpen(false); setDrafts([]); setImagePreview(null)
    toast.success(`${saved} trade${saved !== 1 ? "s" : ""} saved`)
  }

  async function handleSave() {
    if (!draft?.symbol || !draft.action || !draft.shares || !draft.price || !draft.traded_at) {
      toast.error("Fill in all required fields"); return
    }
    setSaving(true)
    const result = await saveDayTrade({
      symbol: draft.symbol.toUpperCase(),
      action: draft.action as "buy" | "sell",
      shares: Number(draft.shares),
      price: Number(draft.price),
      traded_at: new Date(draft.traded_at).toISOString(),
      notes: draft.notes ?? null,
    })
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    setTrades((prev) => [result.trade!, ...prev])
    setOpen(false); setDraft(null); setImagePreview(null)
    toast.success("Trade saved")
  }

  async function handleDelete(id: string) {
    const result = await deleteDayTrade(id)
    if (result.error) { toast.error(result.error); return }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    toast.success("Trade deleted")
  }

  function openManual() {
    setDraft({ symbol: "", action: "buy", shares: 0, price: 0, traded_at: new Date().toISOString().slice(0, 16), notes: "" })
    setImagePreview(null); setOpen(true)
  }

  const { trips, openLegs } = computeRoundTrips(trades)
  const symbolTotals = computeSymbolTotals(trips)
  const totalPnl = symbolTotals.reduce((s, r) => s + r.pnl, 0)

  // PDT count: round-trips where open and close are same calendar day
  const fiveBusinessDaysAgo = new Date()
  let daysBack = 0, calDays = 0
  while (daysBack < 5) {
    calDays++
    const d = new Date(fiveBusinessDaysAgo.getTime() - calDays * 86400000)
    if (d.getDay() !== 0 && d.getDay() !== 6) daysBack++
  }
  fiveBusinessDaysAgo.setTime(fiveBusinessDaysAgo.getTime() - calDays * 86400000)
  const pdtCount = trips.filter((t) => {
    if (new Date(t.closedAt) < fiveBusinessDaysAgo) return false
    return t.openedAt.slice(0, 10) === t.closedAt.slice(0, 10)
  }).length

  return (
    <div
      className={`space-y-3 transition-colors ${dragging ? "outline-2 outline-dashed outline-primary/50 rounded-xl bg-primary/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Day Trades
          {trips.length > 0 && (
            <span className={`text-sm font-medium ml-1 ${totalPnl > 0 ? "text-emerald-500" : totalPnl < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
              {totalPnl >= 0 ? "+" : ""}{currency(totalPnl)}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {pdtCount >= 2 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              pdtCount >= 3
                ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800"
                : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
            }`}>PDT: {pdtCount}/3</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = "" }} />
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {parsing ? "Parsing…" : "Upload Screenshot"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1 bg-transparent" onClick={openManual}>
            <Plus className="w-4 h-4" /> Manual
          </Button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Symbol P&L chips */}
          {symbolTotals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {symbolTotals.map(({ symbol, pnl, count }) => (
                <div key={symbol} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${
                  pnl > 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : pnl < 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                  : "bg-muted border-border text-muted-foreground"}`}>
                  {pnl > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : pnl < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                  <span>{symbol}</span>
                  <span className="opacity-60 text-xs">({count})</span>
                  <span>{pnl >= 0 ? "+" : ""}{currency(pnl)}</span>
                </div>
              ))}
            </div>
          )}

          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-xl gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Upload a trade screenshot to get started</p>
            </div>
          ) : (
            <>
              {/* View toggle */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <button onClick={() => setShowOrders(false)} className={`px-2.5 py-1 rounded-md transition-colors ${!showOrders ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  Round Trips
                </button>
                <button onClick={() => setShowOrders(true)} className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${showOrders ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <List className="w-3 h-3" /> All Orders
                </button>
              </div>

              {/* Round Trips view */}
              {!showOrders && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Entry</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Exit</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map((t, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-semibold">{t.symbol}</div>
                            <div className="text-xs text-muted-foreground">{t.entryAction === "buy" ? "Long" : "Short"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="font-medium">{currency(t.entryPrice)}</div>
                            <div className="text-xs text-muted-foreground">{t.entryAction === "buy" ? "Bought" : "Shorted"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="font-medium">{currency(t.exitPrice)}</div>
                            <div className="text-xs text-muted-foreground">{t.entryAction === "buy" ? "Sold" : "Covered"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{t.shares}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${t.pnl > 0 ? "text-emerald-500" : t.pnl < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                            {t.pnl >= 0 ? "+" : ""}{currency(t.pnl)}
                            {getMultiplier(t.symbol) > 1 && (
                              <div className="text-xs font-normal text-muted-foreground">
                                {t.pnl >= 0 ? "+" : ""}{((t.exitPrice - t.entryPrice) * (t.entryAction === "buy" ? 1 : -1)).toFixed(2)} pts
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {format(new Date(t.closedAt), "MMM d, h:mm a")}
                          </td>
                        </tr>
                      ))}
                      {openLegs.length > 0 && (
                        <tr className="bg-amber-500/5 border-t border-amber-500/20">
                          <td colSpan={6} className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                            {openLegs.length} open leg{openLegs.length !== 1 ? "s" : ""} (no matching close yet)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* All Orders view */}
              {showOrders && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Price</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Time</th>
                        <th className="px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...trades].sort((a, b) => new Date(b.traded_at).getTime() - new Date(a.traded_at).getTime()).map((t) => (
                        <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-semibold">{t.symbol}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.action === "buy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"}`}>
                              {t.action.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">{t.shares}</td>
                          <td className="px-4 py-2.5 text-right">{currency(t.price)}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{currency(t.total)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {format(new Date(t.traded_at), "MMM d, h:mm a")}
                            {t.notes && <span className="block opacity-60 truncate max-w-[120px]">{t.notes}</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDraft(null); setDrafts([]); setImagePreview(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isMultiMode ? `Review ${drafts.length} Parsed Trades` : "Log Trade"}</DialogTitle>
          </DialogHeader>
          {imagePreview && <img src={imagePreview} alt="Trade screenshot" className="w-full rounded-lg max-h-32 object-contain bg-muted" />}

          {isMultiMode && (
            <div className="space-y-3 mt-1">
              <p className="text-xs text-muted-foreground">Review and edit before saving. Remove any trades that look wrong.</p>
              {drafts.map((d, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.action === "buy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"}`}>
                        {(d.action ?? "buy").toUpperCase()}
                      </span>
                      <Input className="h-7 w-24 text-sm font-semibold" value={d.symbol ?? ""} onChange={(e) => setDrafts((prev) => prev.map((x, j) => j === i ? { ...x, symbol: e.target.value.toUpperCase() } : x))} />
                      <Select value={d.action ?? "buy"} onValueChange={(v) => setDrafts((prev) => prev.map((x, j) => j === i ? { ...x, action: v as "buy" | "sell" } : x))}>
                        <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Qty</Label><Input className="h-7 text-sm" type="number" value={d.shares ?? ""} onChange={(e) => setDrafts((prev) => prev.map((x, j) => j === i ? { ...x, shares: parseFloat(e.target.value) } : x))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Price</Label><Input className="h-7 text-sm" type="number" step="0.01" value={d.price ?? ""} onChange={(e) => setDrafts((prev) => prev.map((x, j) => j === i ? { ...x, price: parseFloat(e.target.value) } : x))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Total</Label><p className="h-7 flex items-center text-sm font-medium">{d.shares && d.price ? currency(Number(d.shares) * Number(d.price)) : "—"}</p></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Date & Time</Label><Input className="h-7 text-sm" type="datetime-local" value={d.traded_at ? d.traded_at.slice(0, 16) : ""} onChange={(e) => setDrafts((prev) => prev.map((x, j) => j === i ? { ...x, traded_at: e.target.value } : x))} /></div>
                  {d.notes && <p className="text-xs text-muted-foreground truncate">{d.notes}</p>}
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleSaveAll} disabled={saving || drafts.length === 0}>
                  {saving ? "Saving…" : `Save ${drafts.length} Trade${drafts.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}

          {!isMultiMode && draft && (
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Symbol</Label><Input value={draft.symbol ?? ""} onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value.toUpperCase() }))} placeholder="AAPL" /></div>
                <div className="space-y-1.5"><Label>Action</Label>
                  <Select value={draft.action ?? "buy"} onValueChange={(v) => setDraft((d) => ({ ...d, action: v as "buy" | "sell" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Qty / Contracts</Label><Input type="number" value={draft.shares ?? ""} onChange={(e) => setDraft((d) => ({ ...d, shares: parseFloat(e.target.value) }))} placeholder="1" /></div>
                <div className="space-y-1.5"><Label>Fill Price</Label><Input type="number" step="0.01" value={draft.price ?? ""} onChange={(e) => setDraft((d) => ({ ...d, price: parseFloat(e.target.value) }))} placeholder="28845.75" /></div>
              </div>
              <div className="space-y-1.5"><Label>Date & Time</Label><Input type="datetime-local" value={draft.traded_at ? draft.traded_at.slice(0, 16) : ""} onChange={(e) => setDraft((d) => ({ ...d, traded_at: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Notes <span className="text-muted-foreground">(optional)</span></Label><Input value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Entry price, fees, etc." /></div>
              {draft.shares && draft.price && <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{currency(Number(draft.shares) * Number(draft.price))}</span></p>}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Trade"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
