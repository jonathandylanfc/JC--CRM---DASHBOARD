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
  time: number
  thumbnail: string | null
  symbols: string[]
  summary: string | null
}

// ── Simple RSS/XML parser (no external deps) ──────────────────────────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function stripHtml(str: string): string {
  // Decode entities first, then strip tags
  return decodeEntities(str).replace(/<[^>]+>/g, "").trim()
}

function extractCDATA(xml: string, tag: string): string | null {
  // Match <tag><![CDATA[...]]></tag> or <tag>...</tag>
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  )
  const m = re.exec(xml)
  if (!m) return null
  return (m[1] ?? m[2] ?? "").trim() || null
}

function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, "i")
  const m = re.exec(xml)
  return m ? m[1].trim() : null
}

function parseRSSItems(xml: string): Array<{ title: string; link: string; pubDate: string | null; source: string | null; description: string | null }> {
  const items: Array<{ title: string; link: string; pubDate: string | null; source: string | null; description: string | null }> = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1]
    const title = extractCDATA(body, "title")
    // Google News RSS puts URL in <link> as text node after the closing tag of CDATA, or in <guid>
    const link = extractCDATA(body, "link") ?? extractCDATA(body, "guid")
    const pubDate = extractCDATA(body, "pubDate")
    // <source url="...">Name</source>
    const sourceUrl = getAttr(body, "source", "url")
    const sourceName = extractCDATA(body, "source")
    const description = extractCDATA(body, "description")

    if (!title || !link) continue
    items.push({
      title: stripHtml(title),
      link,
      pubDate,
      source: sourceName ?? (sourceUrl ? new URL(sourceUrl).hostname.replace("www.", "") : null),
      // Google News descriptions are nested HTML lists — not useful, skip them
      description: null,
    })
  }
  return items
}

// ── Google News RSS ──────────────────────────────────────────────────────────

async function fetchGoogleNews(query: string, count: number): Promise<NewsItem[]> {
  const isGeneric = query === "stock market investing finance" || query === "market"

  // For generic market queries use the finance category feed first (broader, better quality)
  // For symbol-specific queries go straight to search so results are actually relevant
  const urls = isGeneric
    ? [
        `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en`,
        `https://news.google.com/rss/search?q=${encodeURIComponent("stock market stocks investing earnings Wall Street")}&hl=en-US&gl=US&ceid=US:en`,
      ]
    : [
        `https://news.google.com/rss/search?q=${encodeURIComponent(query + " stock")}&hl=en-US&gl=US&ceid=US:en`,
      ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml,application/xml,text/xml,*/*" },
        cache: "no-store",
      })
      if (!res.ok) continue
      const xml = await res.text()
      const parsed = parseRSSItems(xml)
      if (!parsed.length) continue

      return parsed.slice(0, count).map((item, i) => ({
        id: item.link + i,
        title: item.title,
        url: item.link,
        publisher: item.source ?? "News",
        time: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : 0,
        thumbnail: null,
        symbols: [],
        summary: item.description,
      }))
    } catch {
      // try next
    }
  }
  return []
}

// ── Yahoo Finance news (primary) ─────────────────────────────────────────────

async function fetchYahooNews(query: string, count: number): Promise<NewsItem[]> {
  const urls = [
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`,
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
      if (!res.ok) continue
      const json = await res.json()
      const items: Record<string, unknown>[] = json?.news ?? []
      if (!items.length) continue

      return items.map((item) => {
        const thumb = item.thumbnail as { resolutions?: { url: string; width: number }[] } | null
        const bestThumb = thumb?.resolutions?.sort((a, b) => b.width - a.width)?.[0]?.url ?? null
        return {
          id: (item.uuid as string) ?? (item.link as string) ?? "",
          title: (item.title as string) ?? "",
          url: (item.link as string) ?? "",
          publisher: (item.publisher as string) ?? "",
          time: (item.providerPublishTime as number) ?? 0,
          thumbnail: bestThumb,
          symbols: (item.relatedTickers as string[]) ?? [],
          summary: (item.summary as string) ?? null,
        }
      })
    } catch {
      // try next
    }
  }
  return []
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "stock market today"
  const count = Math.min(parseInt(req.nextUrl.searchParams.get("count") ?? "24"), 40)

  // 1. Try Yahoo Finance
  const yfNews = await fetchYahooNews(query, count)
  if (yfNews.length > 0) {
    yfNews.sort((a, b) => b.time - a.time)
    return NextResponse.json({ news: yfNews.slice(0, count) })
  }

  // 2. Fallback: Google News RSS
  const googleQuery = query === "market" ? "stock market investing finance" : query
  const googleNews = await fetchGoogleNews(googleQuery, count)
  if (googleNews.length > 0) {
    googleNews.sort((a, b) => b.time - a.time)
    return NextResponse.json({ news: googleNews.slice(0, count) })
  }

  return NextResponse.json({ news: [] })
}
