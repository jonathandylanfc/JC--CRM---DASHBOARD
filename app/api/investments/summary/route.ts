import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: investments } = await supabase
    .from("investments")
    .select("symbol, shares, avg_cost, current_price")
    .eq("user_id", user.id)

  if (!investments?.length) {
    return NextResponse.json({ totalValue: 0, totalCost: 0, totalGain: 0, totalGainPct: 0, todayChange: null, holdings: 0 })
  }

  const totalValue = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
  const totalCost = investments.reduce((s, i) => s + i.shares * i.avg_cost, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  // Fetch previous close for today's change
  const today = new Date().toISOString().slice(0, 10)
  const symbols = investments.map((i) => i.symbol.toUpperCase())
  const { data: prevRows } = await supabase
    .from("investment_price_snapshots")
    .select("symbol, price, snapshot_date")
    .eq("user_id", user.id)
    .in("symbol", symbols)
    .lt("snapshot_date", today)
    .not("snapshot_date", "is", null)
    .order("snapshot_date", { ascending: false })
    .limit(symbols.length * 5)

  let todayChange: number | null = null
  if (prevRows?.length) {
    const prevCloseMap: Record<string, number> = {}
    for (const row of prevRows) {
      const sym = (row.symbol as string).toUpperCase()
      if (!(sym in prevCloseMap)) prevCloseMap[sym] = Number(row.price)
    }
    let prevTotal = 0
    let hasPrevForAll = true
    for (const inv of investments) {
      const prev = prevCloseMap[inv.symbol.toUpperCase()]
      if (prev == null) { hasPrevForAll = false; break }
      prevTotal += inv.shares * prev
    }
    if (hasPrevForAll) todayChange = totalValue - prevTotal
  }

  return NextResponse.json({
    totalValue: parseFloat(totalValue.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    totalGain: parseFloat(totalGain.toFixed(2)),
    totalGainPct: parseFloat(totalGainPct.toFixed(2)),
    todayChange: todayChange != null ? parseFloat(todayChange.toFixed(2)) : null,
    holdings: investments.length,
  })
}
