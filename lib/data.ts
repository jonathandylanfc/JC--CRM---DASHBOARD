import { createClient } from "@/lib/supabase/server"
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from "date-fns"

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

export async function getTaskStats() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return { total: 0, done: 0, inProgress: 0, todo: 0 }
  const { data } = await supabase.from("tasks").select("status").eq("user_id", userId)
  if (!data) return { total: 0, done: 0, inProgress: 0, todo: 0 }
  return {
    total: data.length,
    done: data.filter((t) => t.status === "done").length,
    inProgress: data.filter((t) => t.status === "in_progress").length,
    todo: data.filter((t) => t.status === "todo").length,
  }
}

export async function getAssignmentCount() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return 0
  const { count } = await supabase
    .from("assignments")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
  return count ?? 0
}

export async function getCategoryMappings(): Promise<Record<string, string>> {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return {}
  const { data } = await supabase
    .from("category_mappings")
    .select("title, category")
    .eq("user_id", userId)
  if (!data) return {}
  return Object.fromEntries(data.map((m) => [m.title.toLowerCase(), m.category]))
}

export async function getMonthlyFinanceSummary(month?: string) {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return { income: 0, expenses: 0 }
  const base = month ? new Date(month + "-02") : new Date()
  const monthStart = format(startOfMonth(base), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(base), "yyyy-MM-dd")
  const { data } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lte("date", monthEnd)
  if (!data) return { income: 0, expenses: 0 }
  const income = data
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const expenses = data
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  return { income, expenses }
}

export async function getWeeklyFocusActivity() {
  const { supabase, userId } = await getAuthenticatedClient()
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 })

  const emptyWeek = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => ({
    day: format(day, "EEEEE"),
    label: format(day, "EEEE"),
    value: 0,
  }))
  if (!userId) return emptyWeek

  const { data } = await supabase
    .from("focus_sessions")
    .select("duration_minutes, started_at")
    .eq("user_id", userId)
    .eq("completed", true)
    .gte("started_at", weekStart.toISOString())
    .lte("started_at", weekEnd.toISOString())

  return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => {
    const minutes = (data ?? [])
      .filter((s) => {
        const d = new Date(s.started_at)
        return d >= startOfDay(day) && d <= endOfDay(day)
      })
      .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0)
    return {
      day: format(day, "EEEEE"),
      label: format(day, "EEEE"),
      value: minutes,
    }
  })
}

export async function getUpcomingAssignments() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("assignments")
    .select("id, title, due_date, priority")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
    .not("due_date", "is", null)
    .order("due_date", { ascending: true })
    .limit(5)
  return data ?? []
}

export async function getRecentTasks() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5)
  return data ?? []
}

export async function getGoalStats() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return { avgProgress: 0, completed: 0, active: 0, total: 0 }
  const { data } = await supabase
    .from("goals")
    .select("progress, status")
    .eq("user_id", userId)
  if (!data || data.length === 0) return { avgProgress: 0, completed: 0, active: 0, total: 0 }
  const active = data.filter((g) => g.status === "active")
  const completed = data.filter((g) => g.status === "completed")
  const avgProgress =
    active.length > 0
      ? Math.round(active.reduce((sum, g) => sum + (g.progress ?? 0), 0) / active.length)
      : 0
  return { avgProgress, completed: completed.length, active: active.length, total: data.length }
}

export async function getTodayFocusMinutes() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return 0
  const now = new Date()
  const { data } = await supabase
    .from("focus_sessions")
    .select("duration_minutes")
    .eq("user_id", userId)
    .eq("completed", true)
    .gte("started_at", startOfDay(now).toISOString())
    .lte("started_at", endOfDay(now).toISOString())
  return (data ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0)
}

export async function getAllTasks() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, priority, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  return data ?? []
}

export async function getAllTransactions() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []

  const PAGE = 1000
  const rows: Array<{ id: string; title: string; amount: number; type: string; category: string; date: string; notes: string | null; balance: number | null; account_name: string | null }> = []
  let from = 0

  while (true) {
    const { data } = await supabase
      .from("transactions")
      .select("id, title, amount, type, category, date, notes, balance, account_name")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return rows
}

export async function getAllSubscriptions() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("subscriptions")
    .select("id, name, amount, billing_cycle, next_billing_date, category, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("next_billing_date", { ascending: true })
  return data ?? []
}

export async function getUserProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single()
  return {
    name: profile?.full_name ?? user.email?.split("@")[0] ?? "You",
    email: user.email ?? "",
    avatar_url: profile?.avatar_url ?? null,
  }
}

export async function getBudgetCategories() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("budget_categories")
    .select("id, name, type, value, sort_order, rollover")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
  return data ?? []
}

export async function getSavingsGoals() {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, target_date, color")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  return data ?? []
}

export async function getPaydayDay(): Promise<number | null> {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return null
  const { data } = await supabase
    .from("profiles")
    .select("payday_day")
    .eq("id", userId)
    .single()
  return data?.payday_day ?? null
}

export async function getMonthlyExpenseTransactions(month?: string) {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const base = month ? new Date(month + "-02") : new Date()
  const monthStart = format(startOfMonth(base), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(base), "yyyy-MM-dd")
  const { data } = await supabase
    .from("transactions")
    .select("id, title, amount, category, date")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: false })
  return data ?? []
}

export async function getMonthlyExpensesByCategory(month?: string): Promise<Record<string, number>> {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return {}
  const base = month ? new Date(month + "-02") : new Date()
  const monthStart = format(startOfMonth(base), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(base), "yyyy-MM-dd")
  const { data } = await supabase
    .from("transactions")
    .select("category, amount")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("date", monthStart)
    .lte("date", monthEnd)
  if (!data) return {}
  const result: Record<string, number> = {}
  for (const tx of data) {
    const cat = tx.category.toLowerCase()
    result[cat] = (result[cat] ?? 0) + Number(tx.amount)
  }
  return result
}

export async function getStartingBalance(): Promise<number> {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return 0
  const { data } = await supabase
    .from("profiles")
    .select("starting_balance")
    .eq("id", userId)
    .single()
  return Number(data?.starting_balance ?? 0)
}

export async function getConnectedBankNames(): Promise<string[]> {
  const { supabase, userId } = await getAuthenticatedClient()
  if (!userId) return []
  const { data } = await supabase
    .from("plaid_items")
    .select("institution_name")
    .eq("user_id", userId)
  return (data ?? [])
    .map((row: { institution_name: string | null }) => row.institution_name)
    .filter((n): n is string => !!n)
}
