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

  const symbols = investments.map((i) => i.symbol.toUpperCase())
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d"

  // ── 1D: use full timestamps for intraday movement ─────────────────────────
  if (rangeParam === "1d") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: snapshots } = await supabase
      .from("investment_price_snapshots")
      .select("symbol, price, snapshot_at")
      .eq("user_id", user.id)
      .in("symbol", symbols)
      .gte("snapshot_at", since)
      .order("snapshot_at", { ascending: true })

    if (snapshots && snapshots.length > 0) {
      // Group by snapshot_at timestamp — sum portfolio value at each point in time
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
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/New_York",
          }),
          value: parseFloat(value.toFixed(2)),
        }))
        .filter((d) => d.value > 0)

      if (history.length > 0) return NextResponse.json({ history })
    }

    // Fallback: single point at current value
    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    return NextResponse.json({
      history: total > 0 ? [{ date: new Date().toISOString(), label: "Now", value: parseFloat(total.toFixed(2)) }] : [],
    })
  }

  // ── Multi-day ranges: aggregate by date ────────────────────────────────────
  const daysMap: Record<string, number> = {
    "30d": 30, "6m": 180, "1y": 365, "all": 1825,
  }
  const days = daysMap[rangeParam] ?? 30
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: snapshots } = await supabase
    .from("investment_price_snapshots")
    .select("symbol, price, snapshot_date")
    .eq("user_id", user.id)
    .in("symbol", symbols)
    .gte("snapshot_date", fromDate)
    .order("snapshot_date", { ascending: true })

  if (snapshots && snapshots.length > 0) {
    // For each date, use the LAST snapshot price per symbol (most recent of that day)
    const dateSymbolPrice = new Map<string, Map<string, number>>()
    for (const snap of snapshots) {
      const date = snap.snapshot_date as string
      const sym = (snap.symbol as string).toUpperCase()
      if (!dateSymbolPrice.has(date)) dateSymbolPrice.set(date, new Map())
      dateSymbolPrice.get(date)!.set(sym, Number(snap.price))
    }

    const history = Array.from(dateSymbolPrice.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, priceMap]) => {
        const value = investments.reduce((sum, inv) => {
          const price = priceMap.get(inv.symbol.toUpperCase()) ?? inv.current_price ?? inv.avg_cost
          return sum + inv.shares * price
        }, 0)
        return {
          date,
          label: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
          }),
          value: parseFloat(value.toFixed(2)),
        }
      })
      .filter((d) => d.value > 0)

    if (history.length > 0) return NextResponse.json({ history })
  }

  // Fallback: today's current value as a single point
  const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
  const today = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    history: total > 0
      ? [{ date: today, label: new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: parseFloat(total.toFixed(2)) }]
      : [],
  })
}
