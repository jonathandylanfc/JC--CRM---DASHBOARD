import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Returns daily portfolio value for the last 30 days
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares")
    .eq("user_id", user.id)

  if (!investments?.length) return NextResponse.json({ history: [] })

  const symbols = investments.map((i) => i.symbol)

  // Fetch 35 days of daily prices per symbol from Yahoo Finance
  const pricesBySymbol = new Map<string, Map<string, number>>() // symbol → date → price

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=35d`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json",
            },
            cache: "no-store",
          }
        )
        const json = await res.json()
        const result = json?.chart?.result?.[0]
        if (!result) return

        const timestamps: number[] = result.timestamp ?? []
        const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

        const dateMap = new Map<string, number>()
        timestamps.forEach((ts, i) => {
          const price = closes[i]
          if (!price) return
          const date = new Date(ts * 1000).toISOString().slice(0, 10)
          dateMap.set(date, price)
        })
        pricesBySymbol.set(symbol, dateMap)
      } catch {
        // skip symbol on error
      }
    })
  )

  // Build sorted list of all dates across all symbols (last 30 trading days)
  const allDates = new Set<string>()
  for (const dateMap of pricesBySymbol.values()) {
    for (const date of dateMap.keys()) allDates.add(date)
  }
  const sortedDates = Array.from(allDates).sort().slice(-30)

  // For each date, compute total portfolio value
  // Forward-fill missing prices (use last known price)
  const history = sortedDates.map((date) => {
    let total = 0
    for (const inv of investments) {
      const dateMap = pricesBySymbol.get(inv.symbol)
      if (!dateMap) continue
      // Find price on or before this date
      const price = dateMap.get(date) ?? [...dateMap.entries()]
        .filter(([d]) => d <= date)
        .sort(([a], [b]) => b.localeCompare(a))[0]?.[1]
      if (price) total += inv.shares * price
    }
    return {
      date,
      label: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: parseFloat(total.toFixed(2)),
    }
  }).filter((d) => d.value > 0)

  return NextResponse.json({ history })
}
