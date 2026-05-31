import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares, avg_cost, current_price")
    .eq("user_id", user.id)

  if (!investments?.length) return NextResponse.json({ history: [] })

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1w"
  const symbols = investments.map((i) => i.symbol.toUpperCase())

  // ── 1D: intraday snapshots only ─────────────────────────────────────────────
  if (rangeParam === "1d") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: snapshots } = await supabase
      .from("investment_price_snapshots")
      .select("symbol, price, snapshot_at")
      .eq("user_id", user.id)
      .in("symbol", symbols)
      .gte("snapshot_at", since)
      .order("snapshot_at", { ascending: true })

    if (snapshots?.length) {
      const timeMap = new Map<string, number>()
      for (const snap of snapshots) {
        const inv = investments.find((i) => i.symbol.toUpperCase() === snap.symbol.toUpperCase())
        if (!inv) continue
        const ts = snap.snapshot_at as string
        timeMap.set(ts, (timeMap.get(ts) ?? 0) + inv.shares * Number(snap.price))
      }
      const history = Array.from(timeMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ts, value]) => ({
          date: ts,
          label: new Date(ts).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
          }),
          value: parseFloat(value.toFixed(2)),
        }))
        .filter((d) => d.value > 0)
      if (history.length > 0) return NextResponse.json({ history })
    }
    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    return NextResponse.json({
      history: total > 0 ? [{ date: new Date().toISOString(), label: "Now", value: parseFloat(total.toFixed(2)) }] : [],
    })
  }

  // ── Multi-day: check Supabase cache first ───────────────────────────────────
  const daysMap: Record<string, number> = { "1w": 7, "30d": 30, "6m": 180, "1y": 365, "all": 1825 }
  const days = daysMap[rangeParam] ?? 30
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Load all daily price snapshots for this range from Supabase
  const { data: cachedSnapshots } = await supabase
    .from("investment_price_snapshots")
    .select("symbol, price, snapshot_date")
    .eq("user_id", user.id)
    .in("symbol", symbols)
    .gte("snapshot_date", cutoff)
    .not("snapshot_date", "is", null)
    .order("snapshot_date", { ascending: true })

  // Cache is "fresh" if we have data from the last 3 days (handles weekends/holidays)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const mostRecentDate = cachedSnapshots?.reduce(
    (max, row) => ((row.snapshot_date as string) > max ? (row.snapshot_date as string) : max),
    ""
  ) ?? ""
  const isCacheFresh = mostRecentDate >= threeDaysAgo && (cachedSnapshots?.length ?? 0) >= 5

  if (isCacheFresh) {
    return NextResponse.json({ history: buildHistory(cachedSnapshots!, investments, rangeParam) })
  }

  // ── Cache stale: fetch from Alpha Vantage ──────────────────────────────────
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  if (!AV_KEY) return NextResponse.json({ history: [], noKey: true })

  const useWeekly = days > 180
  const avFunction = useWeekly ? "TIME_SERIES_WEEKLY" : "TIME_SERIES_DAILY"
  const seriesKey = useWeekly ? "Weekly Time Series" : "Time Series (Daily)"

  type DayPrice = { date: string; price: number }
  const symbolHistory = new Map<string, DayPrice[]>()
  let rateLimited = false

  await Promise.allSettled(
    investments.map(async (inv) => {
      try {
        const url = `https://www.alphavantage.co/query?function=${avFunction}&symbol=${inv.symbol}&outputsize=compact&apikey=${AV_KEY}`
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()

        if (json["Note"] || json["Information"]) {
          console.warn("Alpha Vantage rate limit hit")
          rateLimited = true
          return
        }

        const series = json[seriesKey] as Record<string, Record<string, string>> | undefined
        if (!series) return

        const data: DayPrice[] = Object.entries(series)
          .filter(([date]) => date >= cutoff)
          .map(([date, ohlc]) => ({ date, price: parseFloat(ohlc["4. close"]) }))
          .filter((d) => !isNaN(d.price) && d.price > 0)
          .sort((a, b) => a.date.localeCompare(b.date))

        if (data.length > 0) symbolHistory.set(inv.symbol.toUpperCase(), data)
      } catch (e) {
        console.error("Alpha Vantage error:", e)
      }
    })
  )

  // If rate limited and we have some Supabase data, use what we have
  if (rateLimited && (cachedSnapshots?.length ?? 0) > 0) {
    return NextResponse.json({ history: buildHistory(cachedSnapshots!, investments, rangeParam), rateLimited: true })
  }
  if (rateLimited) {
    return NextResponse.json({ history: [], rateLimited: true })
  }

  if (symbolHistory.size === 0) {
    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    const today = new Date().toISOString().slice(0, 10)
    return NextResponse.json({
      history: total > 0
        ? [{ date: today, label: new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: parseFloat(total.toFixed(2)) }]
        : [],
    })
  }

  // ── Store new prices in Supabase so future requests skip Alpha Vantage ──────
  const existingKeys = new Set(
    cachedSnapshots?.map((d) => `${(d.symbol as string).toUpperCase()}:${d.snapshot_date}`) ?? []
  )
  const newRows: { user_id: string; symbol: string; price: number; snapshot_date: string; snapshot_at: string }[] = []
  for (const [sym, data] of symbolHistory.entries()) {
    for (const { date, price } of data) {
      if (!existingKeys.has(`${sym}:${date}`)) {
        newRows.push({
          user_id: user.id,
          symbol: sym,
          price,
          snapshot_date: date,
          snapshot_at: `${date}T21:00:00Z`, // 4 PM ET close
        })
      }
    }
  }
  if (newRows.length > 0) {
    await supabase.from("investment_price_snapshots").insert(newRows)
  }

  // Merge with cached snapshots and return
  const allSnapshots = [
    ...(cachedSnapshots ?? []),
    ...newRows.map((r) => ({ symbol: r.symbol, price: r.price, snapshot_date: r.snapshot_date })),
  ]
  return NextResponse.json({ history: buildHistory(allSnapshots, investments, rangeParam) })
}

// ── Shared helper: build chart history from snapshot rows ────────────────────
function buildHistory(
  snapshots: Array<{ symbol: unknown; price: unknown; snapshot_date: unknown }>,
  investments: Array<{ symbol: string; shares: number; avg_cost: number; current_price: number | null }>,
  rangeParam: string
) {
  const dateMap = new Map<string, Map<string, number>>()
  for (const snap of snapshots) {
    const date = snap.snapshot_date as string
    const sym = (snap.symbol as string).toUpperCase()
    if (!dateMap.has(date)) dateMap.set(date, new Map())
    dateMap.get(date)!.set(sym, Number(snap.price))
  }

  const lastKnownPrice = new Map<string, number>()
  for (const inv of investments) {
    lastKnownPrice.set(inv.symbol.toUpperCase(), inv.current_price ?? inv.avg_cost)
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, priceMap]) => {
      let value = 0
      for (const inv of investments) {
        const sym = inv.symbol.toUpperCase()
        const price = priceMap.get(sym)
        if (price != null) lastKnownPrice.set(sym, price)
        value += inv.shares * (lastKnownPrice.get(sym) ?? inv.current_price ?? inv.avg_cost)
      }
      const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric",
        ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
      })
      return { date, label, value: parseFloat(value.toFixed(2)) }
    })
    .filter((d) => d.value > 0)
}
