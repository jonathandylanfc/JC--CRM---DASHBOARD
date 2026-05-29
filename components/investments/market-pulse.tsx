"use client"

import { useEffect, useState, useCallback } from "react"
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"

interface Quote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  preMarketPrice?: number
  preMarketChange?: number
  preMarketChangePercent?: number
  postMarketPrice?: number
  postMarketChange?: number
  postMarketChangePercent?: number
  marketState?: string
}

const INDEX_LABELS: Record<string, string> = {
  "^GSPC":   "S&P 500",
  "^DJI":    "Dow Jones",
  "^IXIC":   "NASDAQ",
  "^RUT":    "Russell 2K",
  "^VIX":    "VIX",
  "BTC-USD": "Bitcoin",
}

function fmt(n: number, isBig: boolean) {
  if (isBig) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

function fmtChange(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`
}

interface Props {
  holdingSymbols?: string[]
}

export function MarketPulse({ holdingSymbols = [] }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchQuotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const params = holdingSymbols.length ? `?symbols=${holdingSymbols.join(",")}` : ""
      const res = await fetch(`/api/market/quotes${params}`, { cache: "no-store" })
      const data = await res.json()
      setQuotes(data.quotes ?? [])
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [holdingSymbols.join(",")])

  useEffect(() => {
    fetchQuotes()
    const interval = setInterval(() => fetchQuotes(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchQuotes])

  const indexSymbols = ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX", "BTC-USD"]
  const indices = quotes.filter((q) => indexSymbols.includes(q.symbol))
  const holdings = quotes.filter((q) => !indexSymbols.includes(q.symbol))

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Market Pulse</h2>
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 animate-pulse h-20" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Market Pulse</h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => fetchQuotes(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Major indices */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {indices.map((q) => {
          const pct = q.regularMarketChangePercent
          const isUp = pct >= 0
          const isFlat = Math.abs(pct) < 0.05
          const isBig = q.symbol === "BTC-USD"
          const isVix = q.symbol === "^VIX"

          // For VIX, invert the color (higher VIX = bad = red)
          const color = isFlat ? "text-muted-foreground" : isVix
            ? (isUp ? "text-rose-500" : "text-emerald-500")
            : (isUp ? "text-emerald-500" : "text-rose-500")
          const bg = isFlat ? "bg-card" : isVix
            ? (isUp ? "bg-rose-500/5 border-rose-500/20" : "bg-emerald-500/5 border-emerald-500/20")
            : (isUp ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20")

          // Extended hours data
          const isPreMarket = q.marketState === "PRE" && q.preMarketPrice != null
          const isPostMarket = q.marketState === "POST" && q.postMarketPrice != null
          const extPrice = isPreMarket ? q.preMarketPrice! : isPostMarket ? q.postMarketPrice! : null
          const extPct = isPreMarket ? q.preMarketChangePercent! : isPostMarket ? q.postMarketChangePercent! : null

          return (
            <div key={q.symbol} className={`rounded-xl border p-3 transition-all duration-300 ${bg}`}>
              <p className="text-[10px] font-medium text-muted-foreground truncate">
                {INDEX_LABELS[q.symbol] ?? q.shortName ?? q.symbol}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 tabular-nums">
                {fmt(q.regularMarketPrice, isBig)}
              </p>
              <div className={`flex items-center gap-0.5 mt-0.5 ${color}`}>
                {isFlat ? <Minus className="w-3 h-3" /> : isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span className="text-[10px] font-semibold tabular-nums">{fmtPct(pct)}</span>
              </div>
              {extPrice && extPct != null && (
                <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">
                  {isPreMarket ? "Pre" : "Post"}: {fmtPct(extPct)}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* User's holdings quick-view */}
      {holdings.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {holdings.map((q) => {
              const pct = q.regularMarketChangePercent
              const isUp = pct >= 0
              const color = isUp ? "text-emerald-500" : "text-rose-500"
              return (
                <div key={q.symbol} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shrink-0">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{q.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">${q.regularMarketPrice.toFixed(2)}</p>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${color}`}>{fmtPct(pct)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
