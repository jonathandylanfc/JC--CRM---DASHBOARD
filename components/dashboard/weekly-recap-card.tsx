"use client"

import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface Props {
  thisWeek: Record<string, number>
  lastWeek: Record<string, number>
  thisTotal: number
  lastTotal: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function WeeklyRecapCard({ thisWeek, lastWeek, thisTotal, lastTotal }: Props) {
  const totalChange = thisTotal - lastTotal
  const totalChangePct = lastTotal > 0 ? (totalChange / lastTotal) * 100 : 0

  // All categories across both weeks
  const allCats = Array.from(new Set([...Object.keys(thisWeek), ...Object.keys(lastWeek)]))

  // Sort by this week's spending descending
  const rows = allCats
    .map((cat) => {
      const now = thisWeek[cat] ?? 0
      const prev = lastWeek[cat] ?? 0
      const diff = now - prev
      const pct = prev > 0 ? (diff / prev) * 100 : now > 0 ? 100 : 0
      return { cat, now, prev, diff, pct }
    })
    .filter((r) => r.now > 0 || r.prev > 0)
    .sort((a, b) => b.now - a.now)
    .slice(0, 6)

  const noData = thisTotal === 0 && lastTotal === 0

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Weekly Spending Recap</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This week vs last week</p>
        </div>
        {!noData && (
          <div className={`text-right ${totalChange <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            <p className="text-lg font-bold">{currency(thisTotal)}</p>
            <div className="flex items-center justify-end gap-1 text-xs font-medium">
              {totalChange < 0 ? (
                <TrendingDown className="w-3 h-3" />
              ) : totalChange > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {totalChange === 0
                ? "same as last week"
                : `${totalChange > 0 ? "+" : ""}${currency(Math.abs(totalChange))} (${totalChangePct > 0 ? "+" : ""}${totalChangePct.toFixed(0)}%) vs last week`}
            </div>
          </div>
        )}
      </div>

      {noData ? (
        <p className="text-sm text-muted-foreground text-center py-4">No spending data for the past two weeks.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ cat, now, prev, diff, pct }) => {
            const up = diff > 0
            const same = diff === 0
            const barPct = thisTotal > 0 ? (now / thisTotal) * 100 : 0

            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium capitalize text-foreground">{cat}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{currency(now)}</span>
                    {prev > 0 && (
                      <span className={`flex items-center gap-0.5 font-medium ${up ? "text-rose-500" : same ? "text-muted-foreground" : "text-emerald-500"}`}>
                        {up ? <TrendingUp className="w-3 h-3" /> : same ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {up ? "+" : ""}{pct.toFixed(0)}%
                      </span>
                    )}
                    {prev === 0 && now > 0 && (
                      <span className="text-xs text-amber-500 font-medium">new</span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all duration-500"
                    style={{ width: `${Math.min(barPct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!noData && lastTotal > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
          Last week total: {currency(lastTotal)}
        </p>
      )}
    </Card>
  )
}
