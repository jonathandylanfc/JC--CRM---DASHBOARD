"use client"

import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Upload, Trash2, TrendingUp, TrendingDown, ImageIcon, Loader2, ChevronDown, ChevronRight, Plus } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { saveDayTrade, deleteDayTrade, type DayTrade } from "@/app/investments/day-trades-actions"

interface Props {
  initialTrades: DayTrade[]
}

const priorityColor = (pnl: number) =>
  pnl > 0 ? "text-emerald-500" : pnl < 0 ? "text-rose-500" : "text-muted-foreground"

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

// Match buys to sells FIFO to compute realized P&L per symbol
function computePnl(trades: DayTrade[]) {
  const bySymbol: Record<string, DayTrade[]> = {}
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(t)
  }

  const results: Array<{ symbol: string; pnl: number; trades: number }> = []

  for (const [symbol, symTrades] of Object.entries(bySymbol)) {
    const sorted = [...symTrades].sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime())
    const buys: Array<{ shares: number; price: number }> = []
    let pnl = 0

    for (const t of sorted) {
      if (t.action === "buy") {
        buys.push({ shares: t.shares, price: t.price })
      } else {
        let remaining = t.shares
        while (remaining > 0 && buys.length > 0) {
          const buy = buys[0]
          const matched = Math.min(remaining, buy.shares)
          pnl += matched * (t.price - buy.price)
          buy.shares -= matched
          remaining -= matched
          if (buy.shares <= 0) buys.shift()
        }
      }
    }
    results.push({ symbol, pnl, trades: symTrades.length })
  }

  return results
}

export function DayTradesTracker({ initialTrades }: Props) {
  const [trades, setTrades] = useState<DayTrade[]>(initialTrades)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Partial<DayTrade> | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(file: File) {
    setParsing(true)
    setImagePreview(URL.createObjectURL(file))
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch("/api/investments/parse-trade", { method: "POST", body: fd })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      setDraft({
        symbol: data.trade.symbol ?? "",
        action: data.trade.action ?? "buy",
        shares: data.trade.shares ?? 0,
        price: data.trade.price ?? 0,
        traded_at: data.trade.traded_at ?? new Date().toISOString(),
        notes: data.trade.notes ?? "",
      })
      setOpen(true)
    } catch {
      toast.error("Failed to parse screenshot")
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!draft?.symbol || !draft.action || !draft.shares || !draft.price || !draft.traded_at) {
      toast.error("Fill in all required fields")
      return
    }
    setSaving(true)
    const result = await saveDayTrade({
      symbol: draft.symbol.toUpperCase(),
      action: draft.action as "buy" | "sell",
      shares: Number(draft.shares),
      price: Number(draft.price),
      traded_at: draft.traded_at,
      notes: draft.notes ?? null,
    })
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    setTrades((prev) => [result.trade!, ...prev])
    setOpen(false)
    setDraft(null)
    setImagePreview(null)
    toast.success("Trade saved")
  }

  async function handleDelete(id: string) {
    const result = await deleteDayTrade(id)
    if (result.error) { toast.error(result.error); return }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    toast.success("Trade deleted")
  }

  function openManual() {
    setDraft({
      symbol: "",
      action: "buy",
      shares: 0,
      price: 0,
      traded_at: new Date().toISOString().slice(0, 16),
      notes: "",
    })
    setImagePreview(null)
    setOpen(true)
  }

  const pnlSummary = computePnl(trades)
  const totalPnl = pnlSummary.reduce((s, r) => s + r.pnl, 0)

  // Count day trades in last 5 business days (PDT rule)
  const fiveBusinessDaysAgo = new Date()
  let daysBack = 0, calDays = 0
  while (daysBack < 5) {
    calDays++
    const d = new Date(fiveBusinessDaysAgo.getTime() - calDays * 86400000)
    if (d.getDay() !== 0 && d.getDay() !== 6) daysBack++
  }
  fiveBusinessDaysAgo.setTime(fiveBusinessDaysAgo.getTime() - calDays * 86400000)

  const recentTrades = trades.filter((t) => new Date(t.traded_at) >= fiveBusinessDaysAgo)
  // A day trade = buying and selling same symbol same day
  const dayTradeDays = new Set(
    recentTrades.map((t) => `${t.symbol}-${t.traded_at.slice(0, 10)}`)
  )
  const symbolDays = [...dayTradeDays].map((k) => k.split("-")[0] + "-" + k.split("-").slice(1).join("-"))
  const pdtCount = symbolDays.filter((sd) => {
    const [sym, day] = [sd.split("-")[0], sd.slice(sd.indexOf("-") + 1)]
    return recentTrades.some((t) => t.symbol === sym && t.traded_at.slice(0, 10) === day && t.action === "buy") &&
           recentTrades.some((t) => t.symbol === sym && t.traded_at.slice(0, 10) === day && t.action === "sell")
  }).length

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Day Trades
          {trades.length > 0 && (
            <span className={`text-sm font-medium ml-1 ${priorityColor(totalPnl)}`}>
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
            }`}>
              PDT: {pdtCount}/3
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = "" }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {parsing ? "Parsing…" : "Upload Screenshot"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1 bg-transparent" onClick={openManual}>
            <Plus className="w-4 h-4" />
            Manual
          </Button>
        </div>
      </div>

      {expanded && (
        <>
          {/* P&L summary by symbol */}
          {pnlSummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pnlSummary.map(({ symbol, pnl, trades: count }) => (
                <div
                  key={symbol}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${
                    pnl > 0
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : pnl < 0
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                      : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {pnl > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : pnl < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                  <span>{symbol}</span>
                  <span className="opacity-70 text-xs">({count})</span>
                  <span>{pnl >= 0 ? "+" : ""}{currency(pnl)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Trade log */}
          {trades.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-xl gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Upload a trade screenshot to get started</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Symbol</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Shares</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Time</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-semibold">{t.symbol}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.action === "buy"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(t.id)}
                        >
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

      {/* Add / Edit trade dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDraft(null); setImagePreview(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Trade</DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <img src={imagePreview} alt="Trade screenshot" className="w-full rounded-lg max-h-40 object-contain bg-muted" />
          )}
          {draft && (
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Symbol</Label>
                  <Input
                    value={draft.symbol ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value.toUpperCase() }))}
                    placeholder="AAPL"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Action</Label>
                  <Select value={draft.action ?? "buy"} onValueChange={(v) => setDraft((d) => ({ ...d, action: v as "buy" | "sell" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shares</Label>
                  <Input
                    type="number"
                    value={draft.shares ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, shares: parseFloat(e.target.value) }))}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Price per share</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.price ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, price: parseFloat(e.target.value) }))}
                    placeholder="150.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={draft.traded_at ? draft.traded_at.slice(0, 16) : ""}
                  onChange={(e) => setDraft((d) => ({ ...d, traded_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Order type, fees, etc."
                />
              </div>
              {draft.shares && draft.price ? (
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{currency(Number(draft.shares) * Number(draft.price))}</span>
                </p>
              ) : null}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Trade"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
