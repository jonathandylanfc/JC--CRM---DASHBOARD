"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, RefreshCw } from "lucide-react"

export function SpendingInsightsCard() {
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchInsights() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/insights", { method: "POST" })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setInsights(data.insights ?? [])
      setLoaded(true)
    } catch {
      setError("Failed to load insights")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <h3 className="font-semibold text-sm text-foreground">AI Spending Insights</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={fetchInsights}
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loaded ? "Refresh" : "Analyze"}
        </Button>
      </div>

      {!loaded && !loading && (
        <div className="text-center py-6">
          <Sparkles className="w-8 h-8 text-violet-300 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Click Analyze to get personalized insights from your last 3 months of spending</p>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive text-center py-4">{error}</p>}

      {loaded && !loading && (
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900">
              <span className="text-violet-500 font-bold text-sm shrink-0">{i + 1}</span>
              <p className="text-sm text-foreground leading-snug">{insight}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
