import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
}

// Fetch historical closes for one symbol, trying multiple Yahoo Finance endpoints
async function fetchHistory(symbol: string, range: string, interval: string): Promise<Map<string, number>> {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
    `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?interval=${interval}&range=${range}&events=history`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
      if (!res.ok) continue
      const text = await res.text()

      // CSV download format (v7/download)
      if (url.includes("/download/")) {
        const dateMap = new Map<string, number>()
        const lines = text.trim().split("\n")
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",")
          const date = cols[0]?.trim()
          const close = parseFloat(cols[4] ?? "") // Adj Close column
          if (date && !isNaN(close) && close > 0) dateMap.set(date, close)
        }
        if (dateMap.size > 0) return dateMap
        continue
      }

      // JSON chart format (v8/chart)
      const json = JSON.parse(text)
      const result = json?.chart?.result?.[0]
      if (!result) continue

      const timestamps: number[] = result.timestamp ?? []
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

      const dateMap = new Map<string, number>()
      timestamps.forEach((ts, i) => {
        const price = closes[i]
        if (!price || isNaN(price)) return
        const date = new Date(ts * 1000).toISOString().slice(0, 10)
        dateMap.set(date, price)
      })
      if (dateMap.size > 0) return dateMap
    } catch {
      // try next URL
    }
  }
  return new Map()
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares, avg_cost, updated_at")
    .eq("user_id", user.id)

  if (!investments?.length) return NextResponse.json({ history: [] })

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d"

  // Map UI range → Yahoo Finance range + interval
  const rangeMap: Record<string, { yRange: string; interval: string; limit: number }> = {
    "30d": { yRange: "1mo",  interval: "1d",  limit: 30 },
    "6m":  { yRange: "6mo",  interval: "1d",  limit: 130 },
    "1y":  { yRange: "1y",   interval: "1d",  limit: 260 },
    "all": { yRange: "5y",   interval: "1wk", limit: 999 },
  }
  const { yRange, interval, limit } = rangeMap[rangeParam] ?? rangeMap["30d"]

  // Fetch historical prices for all symbols in parallel
  const pricesBySymbol = new Map<string, Map<string, number>>()
  await Promise.allSettled(
    investments.map(async (inv) => {
      const dateMap = await fetchHistory(inv.symbol, yRange, interval)
      if (dateMap.size > 0) pricesBySymbol.set(inv.symbol, dateMap)
    })
  )

  // Collect all dates
  const allDates = new Set<string>()
  for (const dateMap of pricesBySymbol.values()) {
    for (const date of dateMap.keys()) allDates.add(date)
  }

  if (allDates.size === 0) return NextResponse.json({ history: [] })

  const sortedDates = Array.from(allDates).sort().slice(-limit)

  // Build portfolio value per date with forward-fill for missing prices
  const history = sortedDates.map((date) => {
    let total = 0
    for (const inv of investments) {
      const dateMap = pricesBySymbol.get(inv.symbol)
      if (!dateMap) {
        // No history fetched — use current avg_cost as fallback
        total += inv.shares * inv.avg_cost
        continue
      }
      // Use exact price or nearest prior price (forward-fill)
      let price: number | undefined = dateMap.get(date)
      if (!price) {
        const prior = [...dateMap.entries()]
          .filter(([d]) => d <= date)
          .sort(([a], [b]) => b.localeCompare(a))[0]
        price = prior?.[1]
      }
      if (price) total += inv.shares * price
    }
    return {
      date,
      label: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
      }),
      value: parseFloat(total.toFixed(2)),
    }
  }).filter((d) => d.value > 0)

  return NextResponse.json({ history })
}
