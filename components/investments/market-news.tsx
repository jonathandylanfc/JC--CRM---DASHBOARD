"use client"

import { useEffect, useState } from "react"
import { Newspaper, ExternalLink, Clock } from "lucide-react"
import type { NewsItem } from "@/app/api/market/news/route"

function timeAgo(unixTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixTs
  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

interface Props {
  holdingSymbols?: string[]
}

export function MarketNews({ holdingSymbols = [] }: Props) {
  const [tab, setTab] = useState<"market" | "holdings">("market")
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/api/market/news?q=market&count=12")
      .then((r) => r.json())
      .then((d) => setAllNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Filter client-side for My Holdings tab — no second API call needed
  const news = tab === "holdings"
    ? allNews.filter((item) =>
        holdingSymbols.some((sym) =>
          item.title.toUpperCase().includes(sym.toUpperCase()) ||
          item.symbols.map((s) => s.toUpperCase()).includes(sym.toUpperCase())
        )
      )
    : allNews

  return (
    <div className="space-y-2">
      {/* Header + tabs */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Market News</h2>
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
          <button
            onClick={() => setTab("market")}
            className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
              tab === "market" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Top Stories
          </button>
          {holdingSymbols.length > 0 && (
            <button
              onClick={() => setTab("holdings")}
              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
                tab === "holdings" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              My Holdings
            </button>
          )}
        </div>
      </div>

      {/* News list */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Newspaper className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">
            {tab === "holdings" ? `No news found for ${holdingSymbols.join(", ")}` : "No news available right now."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {news.slice(0, 8).map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 hover:bg-card/80 transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">{item.publisher}</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />{timeAgo(item.time)}
                  </span>
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
