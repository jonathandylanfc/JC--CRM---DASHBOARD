import { NextRequest, NextResponse } from "next/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
}

// Map Yahoo Finance symbols → Stooq symbols
const YF_TO_STOOQ: Record<string, string> = {
  "^GSPC":   "^spx",
  "^DJI":    "^dji",
  "^IXIC":   "^ndq",
  "^RUT":    "^rut",
  "^VIX":    "vix.us",
  "BTC-USD": "btc.v",
}

const INDEX_NAMES: Record<string, string> = {
  "^GSPC":   "S&P 500",
  "^DJI":    "Dow Jones",
  "^IXIC":   "NASDAQ",
  "^RUT":    "Russell 2K",
  "^VIX":    "VIX",
  "BTC-USD": "Bitcoin",
}

// Fetch a batch of quotes from Stooq CSV API
async function fetchStooqQuotes(yfSymbols: string[]): Promise<Record<string, unknown>[]> {
  // Build Stooq symbol list
  const stooqSymbols = yfSymbols.map((s) => {
    if (YF_TO_STOOQ[s]) return YF_TO_STOOQ[s]
    return `${s.toLowerCase()}.us` // US stocks
  })

  const url = `https://stooq.com/q/l/?s=${stooqSymbols.join(",")}&f=sd2t2ohlcvp&h&e=csv`

  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return []
    const text = await res.text()

    // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume,%Chg
    const lines = text.trim().split("\n")
    const results: Record<string, unknown>[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",")
      const stooqSym = cols[0]?.trim()
      const close = parseFloat(cols[6] ?? "")
      const pctChg = parseFloat(cols[8] ?? "")

      if (!stooqSym || isNaN(close) || close <= 0) continue

      // Reverse-map Stooq symbol back to Yahoo Finance symbol
      const yfSym = yfSymbols.find((s) => {
        const mapped = YF_TO_STOOQ[s] ?? `${s.toLowerCase()}.us`
        return mapped.toLowerCase() === stooqSym.toLowerCase()
      }) ?? stooqSym.toUpperCase()

      const change = isNaN(pctChg) ? 0 : close - close / (1 + pctChg / 100)

      results.push({
        symbol: yfSym,
        shortName: INDEX_NAMES[yfSym] ?? yfSym,
        regularMarketPrice: close,
        regularMarketChange: parseFloat(change.toFixed(4)),
        regularMarketChangePercent: isNaN(pctChg) ? 0 : pctChg,
        regularMarketPreviousClose: close - change,
        // Extended hours not available from Stooq
        marketState: "REGULAR",
        // Analyst fields not available from Stooq
      })
    }

    return results
  } catch {
    return []
  }
}

export const revalidate = 0

export async function GET(req: NextRequest) {
  const extraSymbols = req.nextUrl.searchParams.get("symbols") ?? ""
  const indexSymbols = ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX", "BTC-USD"]
  const holdingSymbols = extraSymbols ? extraSymbols.split(",").filter(Boolean) : []
  const allSymbols = [...new Set([...indexSymbols, ...holdingSymbols])]

  const fields = [
    "shortName", "symbol",
    "regularMarketPrice", "regularMarketChange", "regularMarketChangePercent",
    "regularMarketPreviousClose", "regularMarketDayHigh", "regularMarketDayLow",
    "regularMarketVolume",
    "preMarketPrice", "preMarketChange", "preMarketChangePercent",
    "postMarketPrice", "postMarketChange", "postMarketChangePercent",
    "targetMeanPrice", "targetHighPrice", "targetLowPrice",
    "recommendationKey", "numberOfAnalystOpinions",
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
    "marketState",
  ].join(",")

  // ── 1. Try Yahoo Finance ─────────────────────────────────────────────────
  const yfUrls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${allSymbols.join(",")}&fields=${fields}&formatted=false`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${allSymbols.join(",")}&fields=${fields}&formatted=false`,
  ]

  for (const url of yfUrls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
      if (!res.ok) continue
      const json = await res.json()
      const results: Record<string, unknown>[] = json?.quoteResponse?.result ?? []
      if (results.length > 0) {
        return NextResponse.json({ quotes: results, source: "yahoo" }, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        })
      }
    } catch {
      // try next
    }
  }

  // ── 2. Fallback: Stooq ───────────────────────────────────────────────────
  const stooqResults = await fetchStooqQuotes(allSymbols)
  if (stooqResults.length > 0) {
    return NextResponse.json({ quotes: stooqResults, source: "stooq" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  }

  return NextResponse.json({ quotes: [], source: "none" })
}
