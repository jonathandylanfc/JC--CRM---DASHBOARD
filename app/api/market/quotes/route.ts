import { NextRequest, NextResponse } from "next/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
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

  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${allSymbols.join(",")}&fields=${fields}&formatted=false`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${allSymbols.join(",")}&fields=${fields}&formatted=false`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
      if (!res.ok) continue
      const json = await res.json()
      const results: Record<string, unknown>[] = json?.quoteResponse?.result ?? []
      if (!results.length) continue
      return NextResponse.json({ quotes: results }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      })
    } catch {
      // try next URL
    }
  }

  return NextResponse.json({ quotes: [] })
}
