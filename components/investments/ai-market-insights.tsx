"use client"

import { useEffect, useState } from "react"
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Insight {
  icon: string
  text: string
}

export function AiMarketInsights() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(false)
    fetch("/api/investments/ai-insights")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); return }
        setInsights(d.insights ?? [])
        setGeneratedAt(d.generatedAt ?? null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const timeLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">AI Market Insights</h2>
          {timeLabel && (
            <span className="text-[10px] text-muted-foreground">· as of {timeLabel}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 text-muted-foreground hover:text-foreground"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
          <p className="text-[10px] text-muted-foreground text-center">Analyzing your portfolio…</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <AlertCircle className="w-5 h-5 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Couldn't load AI insights.</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Add your Anthropic API key in Railway settings.</p>
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground">No insights available — add holdings first.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {insights.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
              <p className="text-xs text-foreground leading-snug">{item.text}</p>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground text-center pt-0.5">
            AI-generated · not financial advice
          </p>
        </div>
      )}
    </div>
  )
}
