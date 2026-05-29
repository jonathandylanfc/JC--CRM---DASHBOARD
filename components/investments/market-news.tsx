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
  const [marketNews, setMarketNews] = useState<NewsItem[]>([])
  const [holdingsNews, setHoldingsNews] = useState<NewsItem[]>([])
  const [loadingMarket, setLoadingMarket] = useState(true)
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [fetchedHoldings, setFetchedHoldings] = useState(false)

  useEffect(() => {
    setLoadingMarket(true)
    fetch("/api/market/news?q=market&count=24")
      .then((r) => r.json())
      .then((d) => setMarketNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoadingMarket(false))
  }, [])

  useEffect(() => {
    if (tab !== "holdings" || fetchedHoldings || holdingSymbols.length === 0) return
    setLoadingHoldings(true)
    setFetchedHoldings(true)
    const q = holdingSymbols.join(",")
    fetch(`/api/market/news?q=${encodeURIComponent(q)}&count=24`)
      .then((r) => r.json())
      .then((d) => setHoldingsNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoadingHoldings(false))
  }, [tab, fetchedHoldings, holdingSymbols.join(",")])

  const loading = tab === "market" ? loadingMarket : loadingHoldings
  const news = tab === "market" ? marketNews : holdingsNews

  return (
    <div className="space-y-3">
      {/* Header + tabs */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Market News</h2>
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
          <button
            onClick={() => setTab("market")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              tab === "market"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Top Stories
          </button>
          {holdingSymbols.length > 0 && (
            <button
              onClick={() => setTab("holdings")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                tab === "holdings"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              My Holdings
            </button>
          )}
        </div>
      </div>

      {/* News grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Newspaper className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No news available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md hover:border-primary/30 transition-all duration-200 flex flex-col"
            >
              {/* Thumbnail */}
              {item.thumbnail && (
                <div className="h-36 overflow-hidden bg-muted shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                </div>
              )}

              <div className="p-3 flex flex-col gap-1.5 flex-1">
                {/* Publisher + time */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wide truncate">
                    {item.publisher}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(item.time)}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                  {item.title}
                </p>

                {/* Summary if available */}
                {item.summary && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-auto">
                    {item.summary}
                  </p>
                )}

                {/* Related tickers */}
                {item.symbols.length > 0 && (
                  <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
                    {item.symbols.slice(0, 4).map((s) => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Read more */}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-primary transition-colors mt-1">
                  <ExternalLink className="w-2.5 h-2.5" />
                  Read full story
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
