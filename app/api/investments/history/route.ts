import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
}

// Convert a US stock ticker to Stooq symbol (e.g. AAPL → aapl.us)
function toStooqSymbol(ticker: string): string {
  return `${ticker.toLowerCase()}.us`
}

// Fetch from Stooq historical CSV (oldest → newest after we sort)
async function fetchStooqHistory(symbol: string, days: number): Promise<Map<string, number>> {
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const d1 = from.toISOString().slice(0, 10).replace(/-/g, "")
  const d2 = to.toISOString().slice(0, 10).replace(/-/g, "")
  const stooqSym = toStooqSymbol(symbol)
  const url = `https://stooq.com/q/d/l/?s=${stooqSym}&d1=${d1}&d2=${d2}&i=d`

  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return new Map()
    const text = await res.text()
    // Stooq CSV: Date,Open,High,Low,Close,Volume (newest first)
    const dateMap = new Map<string, number>()
    const lines = text.trim().split("\n")
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",")
      const date = cols[0]?.trim()
      const close = parseFloat(cols[4] ?? "")
      if (date && !isNaN(close) && close > 0) dateMap.set(date, close)
    }
    return dateMap
  } catch {
    return new Map()
  }
}

// Fetch historical closes for one symbol — Yahoo Finance first, Stooq fallback
async function fetchHistory(symbol: string, yRange: string, interval: string, days: number, intraday = false): Promise<Map<string, number>> {
  // ── 1. Try Yahoo Finance (multiple endpoints) ─────────────────────────────
  const yfUrls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${yRange}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${yRange}`,
    `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbol}&range=${yRange}&interval=${interval}`,
    `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${symbol}&range=${yRange}&interval=${interval}`,
    // CSV download doesn't support intraday intervals
    ...(!intraday ? [`https://query1.finance.yahoo.com/v7/finance/download/${symbol}?interval=${interval}&range=${yRange}&events=history`] : []),
  ]

  for (const url of yfUrls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" })
      if (!res.ok) continue
      const text = await res.text()

      if (url.includes("/download/")) {
        const dateMap = new Map<string, number>()
        const lines = text.trim().split("\n")
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",")
          const date = cols[0]?.trim()
          const close = parseFloat(cols[4] ?? "")
          if (date && !isNaN(close) && close > 0) dateMap.set(date, close)
        }
        if (dateMap.size > 0) return dateMap
        continue
      }

      const json = JSON.parse(text)

      // Handle spark API format: { spark: { result: [{ symbol, response: [{ timestamp, indicators }] }] } }
      const sparkResult = json?.spark?.result?.[0]?.response?.[0]
      const chartResult = json?.chart?.result?.[0]
      const result = sparkResult ?? chartResult
      if (!result) continue

      const timestamps: number[] = result.timestamp ?? []
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? result.indicators?.adjclose?.[0]?.adjclose ?? []
      const dateMap = new Map<string, number>()
      timestamps.forEach((ts, i) => {
        const price = closes[i]
        if (!price || isNaN(price)) return
        // Intraday: use full datetime key; daily: use date-only key
        const key = intraday
          ? new Date(ts * 1000).toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
          : new Date(ts * 1000).toISOString().slice(0, 10) // YYYY-MM-DD
        dateMap.set(key, price)
      })
      if (dateMap.size > 0) return dateMap
    } catch {
      // try next
    }
  }

  // ── 2. Fallback: Stooq (daily only — use yesterday's close for intraday too) ──
  // For 1D with no intraday data, use yesterday's close so we show *something*
  const stooq = await fetchStooqHistory(symbol, 5)
  if (intraday && stooq.size > 0) {
    // Return a single data point at 09:30 AM ET using the most recent daily close
    const latestClose = [...stooq.entries()].sort(([a], [b]) => b.localeCompare(a))[0]
    if (latestClose) {
      const today = new Date().toISOString().slice(0, 10)
      const key = `${today}T09:30`
      return new Map([[key, latestClose[1]]])
    }
    return new Map()
  }
  return stooq
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

  const rangeMap: Record<string, { yRange: string; interval: string; limit: number; days: number; intraday: boolean }> = {
    "1d":  { yRange: "1d",   interval: "5m",  limit: 80,  days: 1,    intraday: true  },
    "30d": { yRange: "1mo",  interval: "1d",  limit: 30,  days: 35,   intraday: false },
    "6m":  { yRange: "6mo",  interval: "1d",  limit: 130, days: 185,  intraday: false },
    "1y":  { yRange: "1y",   interval: "1d",  limit: 260, days: 370,  intraday: false },
    "all": { yRange: "5y",   interval: "1wk", limit: 999, days: 1825, intraday: false },
  }
  const { yRange, interval, limit, days, intraday } = rangeMap[rangeParam] ?? rangeMap["30d"]

  const pricesBySymbol = new Map<string, Map<string, number>>()
  await Promise.allSettled(
    investments.map(async (inv) => {
      const dateMap = await fetchHistory(inv.symbol, yRange, interval, days, intraday)
      if (dateMap.size > 0) pricesBySymbol.set(inv.symbol, dateMap)
    })
  )

  const allDates = new Set<string>()
  for (const dateMap of pricesBySymbol.values()) {
    for (const date of dateMap.keys()) allDates.add(date)
  }

  if (allDates.size === 0) return NextResponse.json({ history: [] })

  const sortedDates = Array.from(allDates).sort().slice(-limit)

  const history = sortedDates.map((date) => {
    let total = 0
    for (const inv of investments) {
      const dateMap = pricesBySymbol.get(inv.symbol)
      if (!dateMap) {
        total += inv.shares * inv.avg_cost
        continue
      }
      let price: number | undefined = dateMap.get(date)
      if (!price) {
        const prior = [...dateMap.entries()]
          .filter(([d]) => d <= date)
          .sort(([a], [b]) => b.localeCompare(a))[0]
        price = prior?.[1]
      }
      if (price) total += inv.shares * price
    }
    const labelDate = intraday ? new Date(date + "Z") : new Date(date + "T12:00:00")
    const label = intraday
      ? labelDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })
      : labelDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
        })
    return {
      date,
      label,
      value: parseFloat(total.toFixed(2)),
    }
  }).filter((d) => d.value > 0)

  return NextResponse.json({ history })
}
