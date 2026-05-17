import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { format, addMonths, addDays, endOfMonth, startOfMonth } from "date-fns"

export interface AppNotification {
  id: string
  type: "budget" | "payday" | "bill" | "transaction" | "goal"
  title: string
  message: string
  severity: "info" | "warning" | "error" | "success"
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notifications: [] })

  const notifications: AppNotification[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = format(today, "yyyy-MM-dd")

  // ── 1. Budget overages ──────────────────────────────────────────────────────
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd")

  const { data: budgetCats } = await supabase
    .from("budget_categories")
    .select("id, name, type, value")
    .eq("user_id", user.id)

  const { data: monthlyIncomeTx } = await supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", user.id)
    .eq("type", "income")
    .gte("date", monthStart)
    .lte("date", monthEnd)

  const monthlyIncome = (monthlyIncomeTx ?? []).reduce((s, t) => s + Number(t.amount), 0)

  const { data: monthlyExpTx } = await supabase
    .from("transactions")
    .select("category, amount")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", monthStart)
    .lte("date", monthEnd)

  const spentByCategory: Record<string, number> = {}
  for (const tx of monthlyExpTx ?? []) {
    const cat = tx.category.toLowerCase()
    spentByCategory[cat] = (spentByCategory[cat] ?? 0) + Number(tx.amount)
  }

  for (const cat of budgetCats ?? []) {
    const budget = cat.type === "percentage"
      ? (monthlyIncome * cat.value) / 100
      : cat.value
    const spent = spentByCategory[cat.name.toLowerCase()] ?? 0
    if (budget > 0 && spent >= budget) {
      notifications.push({
        id: `budget-over-${cat.id}`,
        type: "budget",
        title: `${cat.name} over budget`,
        message: `You've spent $${spent.toFixed(0)} of your $${budget.toFixed(0)} ${cat.name} budget this month.`,
        severity: "error",
      })
    } else if (budget > 0 && spent >= budget * 0.8) {
      notifications.push({
        id: `budget-warn-${cat.id}`,
        type: "budget",
        title: `${cat.name} budget at ${Math.round((spent / budget) * 100)}%`,
        message: `$${(budget - spent).toFixed(0)} remaining in your ${cat.name} budget.`,
        severity: "warning",
      })
    }
  }

  // ── 2. Payday coming up ─────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("payday_day, payday_type, payday_start_date")
    .eq("id", user.id)
    .single()

  if (profile) {
    const paydayDates: Date[] = []

    if (profile.payday_type === "biweekly" && profile.payday_start_date) {
      let cursor = new Date(profile.payday_start_date + "T12:00:00")
      while (cursor < today) cursor = addDays(cursor, 14)
      paydayDates.push(cursor, addDays(cursor, 14))
    } else if (profile.payday_type === "monthly" && profile.payday_day) {
      for (let i = 0; i < 2; i++) {
        const m = addMonths(today, i)
        const day = Math.min(profile.payday_day, endOfMonth(m).getDate())
        paydayDates.push(new Date(m.getFullYear(), m.getMonth(), day))
      }
    }

    for (const pd of paydayDates) {
      const daysUntil = Math.round((pd.getTime() - today.getTime()) / 86400000)
      if (daysUntil >= 0 && daysUntil <= 3) {
        notifications.push({
          id: `payday-${format(pd, "yyyy-MM-dd")}`,
          type: "payday",
          title: daysUntil === 0 ? "Payday today! 🎉" : `Payday in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
          message: `Your next payday is ${daysUntil === 0 ? "today" : `on ${format(pd, "EEEE, MMM d")}`}.`,
          severity: "success",
        })
        break
      }
    }
  }

  // ── 3. Recurring bills due in next 7 days ───────────────────────────────────
  const threeMonthsAgo = format(addMonths(today, -3), "yyyy-MM-dd")
  const { data: transactions } = await supabase
    .from("transactions")
    .select("title, amount, date")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", threeMonthsAgo)
    .order("date", { ascending: false })

  const groups = new Map<string, { title: string; dates: string[] }>()
  for (const tx of transactions ?? []) {
    const key = `${tx.title.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}`
    if (!groups.has(key)) groups.set(key, { title: tx.title, dates: [] })
    groups.get(key)!.dates.push(tx.date)
  }

  const sevenDaysOut = format(addDays(today, 7), "yyyy-MM-dd")
  for (const [, info] of groups) {
    const months = new Set(info.dates.map((d) => d.slice(0, 7)))
    if (months.size < 2) continue
    const latest = [...info.dates].sort().reverse()[0]
    const lastDate = new Date(latest + "T12:00:00")
    const next = new Date(lastDate)
    next.setMonth(next.getMonth() + 1)
    const nextStr = format(next, "yyyy-MM-dd")
    if (nextStr >= todayStr && nextStr <= sevenDaysOut) {
      const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000)
      notifications.push({
        id: `bill-${info.title}-${nextStr}`,
        type: "bill",
        title: `${info.title} due soon`,
        message: daysUntil === 0
          ? `${info.title} is due today.`
          : `${info.title} is due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${format(next, "MMM d")}).`,
        severity: "warning",
      })
    }
  }

  // ── 4. Large transactions in the last 48 hours ──────────────────────────────
  const twoDaysAgo = format(addDays(today, -2), "yyyy-MM-dd")
  const { data: largeTx } = await supabase
    .from("transactions")
    .select("title, amount, date")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", twoDaysAgo)
    .gte("amount", 200)
    .order("amount", { ascending: false })
    .limit(3)

  for (const tx of largeTx ?? []) {
    notifications.push({
      id: `large-tx-${tx.title}-${tx.date}`,
      type: "transaction",
      title: `Large transaction: $${Number(tx.amount).toFixed(0)}`,
      message: `${tx.title} — $${Number(tx.amount).toFixed(2)} on ${format(new Date(tx.date + "T12:00:00"), "MMM d")}.`,
      severity: "info",
    })
  }

  // ── 5. Savings goal milestones ───────────────────────────────────────────────
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("id, name, current_amount, target_amount")
    .eq("user_id", user.id)

  for (const goal of goals ?? []) {
    const pct = goal.target_amount > 0 ? (Number(goal.current_amount) / Number(goal.target_amount)) * 100 : 0
    if (pct >= 100) {
      notifications.push({
        id: `goal-done-${goal.id}`,
        type: "goal",
        title: `Goal reached: ${goal.name} 🎉`,
        message: `You've hit your $${Number(goal.target_amount).toFixed(0)} savings goal!`,
        severity: "success",
      })
    } else if (pct >= 75) {
      notifications.push({
        id: `goal-75-${goal.id}`,
        type: "goal",
        title: `${goal.name} is 75% funded`,
        message: `$${(Number(goal.target_amount) - Number(goal.current_amount)).toFixed(0)} to go on your ${goal.name} goal.`,
        severity: "info",
      })
    } else if (pct >= 50) {
      notifications.push({
        id: `goal-50-${goal.id}`,
        type: "goal",
        title: `${goal.name} is halfway there`,
        message: `You're 50% of the way to your $${Number(goal.target_amount).toFixed(0)} goal.`,
        severity: "info",
      })
    }
  }

  return NextResponse.json({ notifications })
}
