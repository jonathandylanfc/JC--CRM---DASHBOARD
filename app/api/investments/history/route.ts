import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares, avg_cost, current_price, updated_at")
    .eq("user_id", user.id)

  if (!investments?.length) return NextResponse.json({ history: [] })

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d"
  const daysMap: Record<string, number> = {
    "1d":  1,
    "30d": 30,
    "6m":  180,
    "1y":  365,
    "all": 1825,
  }
  const days = daysMap[rangeParam] ?? 30
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // ── Primary: read from our own Supabase snapshots ─────────────────────────
  const { data: snapshots } = await supabase
    .from("investment_price_snapshots")
    .select("symbol, price, snapshot_date")
    .eq("user_id", user.id)
    .in("symbol", investments.map((i) => i.symbol.toUpperCase()))
    .gte("snapshot_date", fromDate)
    .order("snapshot_date", { ascending: true })

  if (snapshots && snapshots.length > 0) {
    // Group by date, sum portfolio value
    const dateMap = new Map<string, number>()

    for (const snap of snapshots) {
      const inv = investments.find((i) => i.symbol.toUpperCase() === snap.symbol.toUpperCase())
      if (!inv) continue
      const value = inv.shares * Number(snap.price)
      dateMap.set(snap.snapshot_date, (dateMap.get(snap.snapshot_date) ?? 0) + value)
    }

    // For symbols with no snapshot on a given date, use their avg_cost as fallback
    const allDates = Array.from(dateMap.keys()).sort()

    const history = allDates.map((date) => ({
      date,
      label: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
      }),
      value: parseFloat((dateMap.get(date) ?? 0).toFixed(2)),
    })).filter((d) => d.value > 0)

    if (history.length > 0) {
      return NextResponse.json({ history })
    }
  }

  // ── Fallback: synthesise from current prices in investments table ──────────
  // Shows at least today's value as a single point so the chart isn't empty
  const today = new Date().toISOString().slice(0, 10)
  const totalValue = investments.reduce(
    (sum, inv) => sum + inv.shares * (inv.current_price ?? inv.avg_cost),
    0
  )

  if (totalValue > 0) {
    const history = [{
      date: today,
      label: new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: parseFloat(totalValue.toFixed(2)),
    }]
    return NextResponse.json({ history })
  }

  return NextResponse.json({ history: [] })
}
