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
    fetch("/api/market/news?q=market&count=12")
      .then((r) => r.json())
      .then((d) => setMarketNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoadingMarket(false))
  }, [])

  useEffect(() => {
    if (tab !== "holdings" || fetchedHoldings || holdingSymbols.length === 0) return
    setLoadingHoldings(true)
    setFetchedHoldings(true)
    fetch(`/api/market/news?q=${encodeURIComponent(holdingSymbols.join(" "))}&count=12`)
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 animate-pulse h-20" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Newspaper className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No news available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all duration-200"
            >
              {/* Thumbnail */}
              {item.thumbnail && (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }}
                  />
                </div>
              )}

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {/* Publisher + time */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wide truncate">
                    {item.publisher}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(item.time)}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </p>

                {/* Related tickers */}
                {item.symbols.length > 0 && (
                  <div className="flex gap-1">
                    {item.symbols.slice(0, 3).map((s) => (
                      <span key={s} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-0.5 mt-auto">
                  <ExternalLink className="w-2.5 h-2.5" />
                  Read more
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
