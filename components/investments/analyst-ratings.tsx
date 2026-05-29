"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Target, Users } from "lucide-react"
import { Card } from "@/components/ui/card"

interface HoldingQuote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChangePercent: number
  targetMeanPrice?: number
  targetHighPrice?: number
  targetLowPrice?: number
  recommendationKey?: string
  numberOfAnalystOpinions?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
}

interface HoldingWithQuote extends HoldingQuote {
  shares: number
  avg_cost: number
}

const RATING_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "strong_buy": { label: "Strong Buy", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
  "buy":        { label: "Buy",         color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
  "hold":       { label: "Hold",        color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-100 dark:bg-amber-950/40" },
  "underperform": { label: "Underperform", color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-100 dark:bg-rose-950/40" },
  "sell":       { label: "Sell",        color: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-100 dark:bg-rose-950/40" },
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}

interface Props {
  holdingSymbols: string[]
  sharesMap: Record<string, number>
  avgCostMap: Record<string, number>
}

export function AnalystRatings({ holdingSymbols, sharesMap, avgCostMap }: Props) {
  const [quotes, setQuotes] = useState<HoldingWithQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!holdingSymbols.length) { setLoading(false); return }
    fetch(`/api/market/quotes?symbols=${holdingSymbols.join(",")}`)
      .then((r) => r.json())
      .then((d) => {
        const indexSymbols = new Set(["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX", "BTC-USD"])
        const holding = (d.quotes as HoldingQuote[] ?? [])
          .filter((q) => !indexSymbols.has(q.symbol) && holdingSymbols.includes(q.symbol))
          .map((q) => ({
            ...q,
            shares: sharesMap[q.symbol] ?? 0,
            avg_cost: avgCostMap[q.symbol] ?? 0,
          }))
        setQuotes(holding)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [holdingSymbols.join(",")])

  if (loading) {
    return (
      <Card className="p-4 space-y-3">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </Card>
    )
  }

  const withRatings = quotes.filter((q) => q.targetMeanPrice || q.recommendationKey)

  if (!withRatings.length) return null

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Analyst Ratings</h3>
      </div>

      <div className="space-y-3">
        {withRatings.map((q) => {
          const rating = RATING_CONFIG[q.recommendationKey ?? ""] ?? null
          const upside = q.targetMeanPrice
            ? ((q.targetMeanPrice - q.regularMarketPrice) / q.regularMarketPrice) * 100
            : null
          const isUp = (upside ?? 0) >= 0

          // 52-week range position
          const rangeWidth = (q.fiftyTwoWeekHigh ?? 0) - (q.fiftyTwoWeekLow ?? 0)
          const rangePos = rangeWidth > 0
            ? Math.min(Math.max(((q.regularMarketPrice - (q.fiftyTwoWeekLow ?? 0)) / rangeWidth) * 100, 0), 100)
            : null

          return (
            <div key={q.symbol} className="space-y-2 pb-3 border-b border-border last:border-0 last:pb-0">
              {/* Symbol + rating badge */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{q.symbol}</p>
                  {q.shortName && (
                    <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{q.shortName}</p>
                  )}
                </div>
                {rating && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rating.bg} ${rating.color}`}>
                    {rating.label}
                  </span>
                )}
              </div>

              {/* Price target */}
              {q.targetMeanPrice && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Target</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{currency(q.targetMeanPrice)}</span>
                    <span className={`flex items-center gap-0.5 font-semibold ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {upside !== null && pct(upside)}
                    </span>
                  </div>
                </div>
              )}

              {/* Target range */}
              {q.targetLowPrice && q.targetHighPrice && (
                <p className="text-[10px] text-muted-foreground">
                  Range: {currency(q.targetLowPrice)} – {currency(q.targetHighPrice)}
                </p>
              )}

              {/* 52-week range bar */}
              {rangePos !== null && q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh && (
                <div>
                  <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                    <span>{currency(q.fiftyTwoWeekLow)}</span>
                    <span className="text-[9px] text-muted-foreground">52W Range</span>
                    <span>{currency(q.fiftyTwoWeekHigh)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted relative overflow-visible">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary ring-2 ring-background shadow"
                      style={{ left: `${rangePos}%`, transform: "translate(-50%, -50%)" }}
                    />
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-400 opacity-40" />
                  </div>
                </div>
              )}

              {/* Analyst count */}
              {q.numberOfAnalystOpinions && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" />
                  {q.numberOfAnalystOpinions} analyst{q.numberOfAnalystOpinions !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
