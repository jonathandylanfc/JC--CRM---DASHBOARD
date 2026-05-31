"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react"
import Link from "next/link"

interface Summary {
  totalValue: number
  totalCost: number
  totalGain: number
  totalGainPct: number
  todayChange: number | null
  holdings: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function PortfolioSnapshotCard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/investments/summary")
      .then((r) => r.json())
      .then((d) => setSummary(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Portfolio</p>
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-28 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
      </Card>
    )
  }

  if (!summary || summary.holdings === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Portfolio</p>
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">No holdings yet.</p>
        <Link href="/investments" className="text-xs text-primary underline mt-1 block">Add holdings →</Link>
      </Card>
    )
  }

  const isUp = summary.totalGain >= 0
  const todayUp = summary.todayChange != null ? summary.todayChange >= 0 : null

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Portfolio</p>
        <Link href="/investments">
          <BarChart2 className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
        </Link>
      </div>

      <p className="text-2xl font-bold tracking-tight">{currency(summary.totalValue)}</p>

      {/* Today's change */}
      {summary.todayChange != null && (
        <p className={`text-sm font-medium flex items-center gap-1 mt-0.5 ${todayUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {todayUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {summary.todayChange >= 0 ? "+" : ""}{currency(summary.todayChange)} today
        </p>
      )}

      {/* All-time gain */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>Total gain</span>
        <span className={`font-medium ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {summary.totalGain >= 0 ? "+" : ""}{currency(summary.totalGain)} ({summary.totalGainPct >= 0 ? "+" : ""}{summary.totalGainPct.toFixed(2)}%)
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Holdings</span>
        <Link href="/investments" className="font-medium text-foreground hover:underline">{summary.holdings} stocks</Link>
      </div>
    </Card>
  )
}
