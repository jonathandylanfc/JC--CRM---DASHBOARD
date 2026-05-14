import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  // Get payday setting
  const { data: profile } = await supabase
    .from("profiles")
    .select("payday_day")
    .eq("id", user.id)
    .single()

  const paydayDay: number | null = profile?.payday_day ?? null

  // Get recent transactions to detect recurring bills
  const threeMonthsAgo = format(addMonths(new Date(), -3), "yyyy-MM-dd")
  const { data: transactions } = await supabase
    .from("transactions")
    .select("title, amount, category, date")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", threeMonthsAgo)
    .order("date", { ascending: false })

  // Detect recurring: same title+amount appearing in 2+ different months
  const groups = new Map<string, { title: string; amount: number; category: string; dates: string[] }>()
  for (const tx of transactions ?? []) {
    const key = `${tx.title.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}`
    if (!groups.has(key)) groups.set(key, { title: tx.title, amount: Number(tx.amount), category: tx.category, dates: [] })
    groups.get(key)!.dates.push(tx.date)
  }

  const bills: Array<{ name: string; amount: number; category: string; nextDate: string }> = []
  for (const [, info] of groups) {
    const months = new Set(info.dates.map((d) => d.slice(0, 7)))
    if (months.size < 2) continue
    // Find most recent date, project next billing date
    const latest = info.dates.sort().reverse()[0]
    const lastDate = new Date(latest + "T12:00:00")
    const next = new Date(lastDate)
    next.setMonth(next.getMonth() + 1)
    bills.push({
      name: info.title,
      amount: info.amount,
      category: info.category,
      nextDate: format(next, "yyyy-MM-dd"),
    })
  }

  // Generate payday events for next 3 months
  const paydayEvents: Array<{ date: string }> = []
  if (paydayDay) {
    for (let i = 0; i < 3; i++) {
      const m = addMonths(new Date(), i)
      const daysInMonth = endOfMonth(m).getDate()
      const day = Math.min(paydayDay, daysInMonth)
      paydayEvents.push({ date: format(new Date(m.getFullYear(), m.getMonth(), day), "yyyy-MM-dd") })
    }
  }

  return NextResponse.json({ bills, paydayDay, paydayEvents })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { payday_day } = await req.json()
  await supabase.from("profiles").update({ payday_day }).eq("id", user.id)
  return NextResponse.json({ success: true })
}
