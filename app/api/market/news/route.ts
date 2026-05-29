import { NextRequest, NextResponse } from "next/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
}

export interface NewsItem {
  id: string
  title: string
  url: string
  publisher: string
  time: number // unix timestamp
  thumbnail: string | null
  symbols: string[]
  summary: string | null
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "stock market"
  const count = Math.min(parseInt(req.nextUrl.searchParams.get("count") ?? "24"), 40)

  // Try multiple queries to get a good mix
  const queries = query === "market"
    ? ["stock market today", "S&P 500", "investing"]
    : [query]

  const seen = new Set<string>()
  const news: NewsItem[] = []

  for (const q of queries) {
    const urls = [
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=${count}&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`,
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=${count}&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`,
    ]

    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
        if (!res.ok) continue
        const json = await res.json()
        const items: Record<string, unknown>[] = json?.news ?? []
        if (!items.length) continue

        for (const item of items) {
          const id = (item.uuid as string) ?? (item.link as string) ?? ""
          if (seen.has(id)) continue
          seen.add(id)

          const thumb = (item.thumbnail as { resolutions?: { url: string; width: number }[] } | null)
          const bestThumb = thumb?.resolutions?.sort((a, b) => b.width - a.width)?.[0]?.url ?? null

          news.push({
            id,
            title: (item.title as string) ?? "",
            url: (item.link as string) ?? "",
            publisher: (item.publisher as string) ?? "",
            time: (item.providerPublishTime as number) ?? 0,
            thumbnail: bestThumb,
            symbols: (item.relatedTickers as string[]) ?? [],
            summary: (item.summary as string) ?? null,
          })
        }

        if (news.length >= count) break
      } catch {
        // try next URL
      }
    }
    if (news.length >= count) break
  }

  // Sort by most recent
  news.sort((a, b) => b.time - a.time)

  return NextResponse.json({ news: news.slice(0, count) }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  })
}
