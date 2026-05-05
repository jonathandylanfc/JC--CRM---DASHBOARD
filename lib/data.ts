import { createClient } from "@/lib/supabase/server"
import { startOfWeek, endOfWeek, eachDayOfInterval, format, startOfDay, endOfDay } from "date-fns"

export async function getTaskStats() {
  const supabase = await createClient()
  const { data } = await supabase.from("tasks").select("status")
  if (!data) return { total: 0, done: 0, inProgress: 0, todo: 0 }
  return {
    total: data.length,
    done: data.filter((t) => t.status === "done").length,
    inProgress: data.filter((t) => t.status === "in_progress").length,
    todo: data.filter((t) => t.status === "todo").length,
  }
}

export async function getWeeklyFocusActivity() {
  const supabase = await createClient()
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 })

  const { data } = await supabase
    .from("focus_sessions")
    .select("duration_minutes, started_at")
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

export async function getUpcomingTasks() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tasks")
    .select("id, title, due_date, priority")
    .not("due_date", "is", null)
    .not("status", "in", '("done","cancelled")')
    .order("due_date", { ascending: true })
    .limit(3)
  return data ?? []
}

export async function getRecentTasks() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority")
    .order("created_at", { ascending: false })
    .limit(5)
  return data ?? []
}

export async function getGoalStats() {
  const supabase = await createClient()
  const { data } = await supabase.from("goals").select("progress, status")
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
  const supabase = await createClient()
  const now = new Date()
  const { data } = await supabase
    .from("focus_sessions")
    .select("duration_minutes")
    .eq("completed", true)
    .gte("started_at", startOfDay(now).toISOString())
    .lte("started_at", endOfDay(now).toISOString())
  return (data ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0)
}

export async function getAllTasks() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, priority, status, created_at")
    .order("created_at", { ascending: false })
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
