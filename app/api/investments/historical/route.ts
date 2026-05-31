import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Stooq symbol mapping (same as refreshPrices)
function toStooqSymbol(symbol: string): string {
  const upper = symbol.toUpperCase()
  const map: Record<string, string> = {
    "BTC-USD": "btc.v", "ETH-USD": "eth.v", "BTC": "btc.v", "ETH": "eth.v",
  }
  return map[upper] ?? `${symbol.toLowerCase()}.us`
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares, avg_cost, current_price")
    .eq("user_id", user.id)

  if (!investments?.length) return NextResponse.json({ history: [] })

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d"

  // ── 1D: use intraday snapshots from Supabase (populated by refreshPrices) ──
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

    // Fallback: single current value
    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    return NextResponse.json({
      history: total > 0 ? [{ date: new Date().toISOString(), label: "Now", value: parseFloat(total.toFixed(2)) }] : [],
    })
  }

  // ── Multi-day ranges: fetch from Stooq (works from Railway) ───────────────
  const daysMap: Record<string, number> = { "30d": 30, "6m": 180, "1y": 365, "all": 1825 }
  const days = daysMap[rangeParam] ?? 30
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const toDate = new Date()
  const d1 = fmtDate(fromDate)
  const d2 = fmtDate(toDate)

  type DayPrice = { date: string; price: number }
  const symbolHistory = new Map<string, DayPrice[]>()

  await Promise.allSettled(
    investments.map(async (inv) => {
      const stooqSym = toStooqSymbol(inv.symbol)
      try {
        const res = await fetch(
          `https://stooq.com/q/d/l/?s=${stooqSym}&d1=${d1}&d2=${d2}&i=d`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "no-store",
          }
        )
        if (!res.ok) return
        const text = await res.text()
        const lines = text.trim().split("\n")
        if (lines.length < 2) return

        const data: DayPrice[] = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",")
          const date = cols[0]?.trim()
          const close = parseFloat(cols[4]?.trim() ?? "")
          if (date && !isNaN(close) && close > 0) {
            data.push({ date, price: close })
          }
        }

        if (data.length > 0) {
          // Stooq returns newest-first sometimes — sort ascending
          data.sort((a, b) => a.date.localeCompare(b.date))
          symbolHistory.set(inv.symbol.toUpperCase(), data)
        }
      } catch {}
    })
  )

  if (symbolHistory.size === 0) {
    // Final fallback: single point today
    const total = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    const today = toDate.toISOString().slice(0, 10)
    return NextResponse.json({
      history: total > 0
        ? [{ date: today, label: new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: parseFloat(total.toFixed(2)) }]
        : [],
    })
  }

  // Build unified date list from all symbols
  const allDates = new Set<string>()
  for (const data of symbolHistory.values()) {
    data.forEach((d) => allDates.add(d.date))
  }
  const sortedDates = Array.from(allDates).sort()

  // Forward-fill: track last known price per symbol as we walk dates
  const lastKnownPrice = new Map<string, number>()
  for (const inv of investments) {
    lastKnownPrice.set(inv.symbol.toUpperCase(), inv.current_price ?? inv.avg_cost)
  }

  const history = sortedDates.map((date) => {
    let value = 0
    for (const inv of investments) {
      const sym = inv.symbol.toUpperCase()
      const data = symbolHistory.get(sym)
      if (data) {
        const entry = data.find((d) => d.date === date)
        if (entry) lastKnownPrice.set(sym, entry.price)
      }
      value += inv.shares * (lastKnownPrice.get(sym) ?? inv.current_price ?? inv.avg_cost)
    }

    const dateObj = new Date(date + "T12:00:00")
    const label = dateObj.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      ...(rangeParam === "all" || rangeParam === "1y" ? { year: "2-digit" } : {}),
    })

    return { date, label, value: parseFloat(value.toFixed(2)) }
  }).filter((d) => d.value > 0)

  return NextResponse.json({ history })
}
