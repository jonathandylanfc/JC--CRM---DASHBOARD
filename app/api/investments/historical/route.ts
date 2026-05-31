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

  // ── 1D: intraday snapshots from Supabase ────────────────────────────────────
  if (rangeParam === "1d") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const symbols = investments.map((i) => i.symbol.toUpperCase())

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

  // ── Multi-day: Alpha Vantage TIME_SERIES_DAILY ─────────────────────────────
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  if (!AV_KEY) {
    // No key configured — return flag so UI can show setup prompt
    return NextResponse.json({ history: [], noKey: true })
  }

  const daysMap: Record<string, number> = { "1w": 7, "30d": 30, "6m": 180, "1y": 365, "all": 1825 }
  const days = daysMap[rangeParam] ?? 30
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  type DayPrice = { date: string; price: number }
  const symbolHistory = new Map<string, DayPrice[]>()

  // For 1Y/All use weekly series (smaller payload); daily compact covers up to ~5M
  const useWeekly = days > 180
  const avFunction = useWeekly ? "TIME_SERIES_WEEKLY" : "TIME_SERIES_DAILY"
  const seriesKey = useWeekly ? "Weekly Time Series" : "Time Series (Daily)"

  await Promise.allSettled(
    investments.map(async (inv) => {
      try {
        const url = useWeekly
          ? `https://www.alphavantage.co/query?function=${avFunction}&symbol=${inv.symbol}&apikey=${AV_KEY}`
          : `https://www.alphavantage.co/query?function=${avFunction}&symbol=${inv.symbol}&outputsize=compact&apikey=${AV_KEY}`

        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()

        if (json["Note"] || json["Information"]) {
          console.warn("Alpha Vantage rate limit:", json["Note"] ?? json["Information"])
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
        console.error("Alpha Vantage fetch error:", e)
      }
    })
  )

  if (symbolHistory.size === 0) {
    // Fallback: Supabase snapshots
    const fromDate = cutoff
    const symbols = investments.map((i) => i.symbol.toUpperCase())
    const { data: snapshots } = await supabase
      .from("investment_price_snapshots")
      .select("symbol, price, snapshot_date")
      .eq("user_id", user.id)
      .in("symbol", symbols)
      .gte("snapshot_date", fromDate)
      .order("snapshot_date", { ascending: true })

    if (snapshots?.length) {
      const dateMap = new Map<string, Map<string, number>>()
      for (const snap of snapshots) {
        const date = snap.snapshot_date as string
        const sym = (snap.symbol as string).toUpperCase()
        if (!dateMap.has(date)) dateMap.set(date, new Map())
        dateMap.get(date)!.set(sym, Number(snap.price))
      }
      const history = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, priceMap]) => {
          const value = investments.reduce((sum, inv) => {
            const price = priceMap.get(inv.symbol.toUpperCase()) ?? inv.current_price ?? inv.avg_cost
            return sum + inv.shares * price
          }, 0)
          return {
            date,
            label: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            value: parseFloat(value.toFixed(2)),
          }
        })
        .filter((d) => d.value > 0)
      if (history.length > 0) return NextResponse.json({ history })
    }

    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    const today = new Date().toISOString().slice(0, 10)
    return NextResponse.json({
      history: total > 0
        ? [{ date: today, label: new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: parseFloat(total.toFixed(2)) }]
        : [],
    })
  }

  // Merge all symbols into a unified date timeline
  const allDates = new Set<string>()
  for (const data of symbolHistory.values()) data.forEach((d) => allDates.add(d.date))
  const sortedDates = Array.from(allDates).sort()

  const lastKnownPrice = new Map<string, number>()
  for (const inv of investments) {
    lastKnownPrice.set(inv.symbol.toUpperCase(), inv.current_price ?? inv.avg_cost)
  }

  const history = sortedDates.map((date) => {
    let value = 0
    for (const inv of investments) {
      const sym = inv.symbol.toUpperCase()
      const dayEntry = symbolHistory.get(sym)?.find((d) => d.date === date)
      if (dayEntry) lastKnownPrice.set(sym, dayEntry.price)
      value += inv.shares * (lastKnownPrice.get(sym) ?? inv.current_price ?? inv.avg_cost)
    }
    const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
    })
    return { date, label, value: parseFloat(value.toFixed(2)) }
  }).filter((d) => d.value > 0)

  return NextResponse.json({ history })
}
