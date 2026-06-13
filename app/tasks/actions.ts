"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { addDays, addWeeks, addMonths, format } from "date-fns"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
}

export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const title = formData.get("title") as string
  if (!title?.trim()) return { error: "Title is required" }

  const due_date = formData.get("due_date") as string
  const start_time = (formData.get("start_time") as string) || null
  const end_time = (formData.get("end_time") as string) || null
  const { data: inserted, error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: title.trim(),
    description: (formData.get("description") as string) || null,
    due_date: due_date || null,
    start_time,
    end_time,
    priority: (formData.get("priority") as string) || "medium",
    status: "todo",
    recurrence: (formData.get("recurrence") as string) || "none",
    task_category: (formData.get("task_category") as string) || null,
  }).select("id").single()

  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true, taskId: inserted.id as string }
}

export async function toggleTaskStatus(id: string, currentStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const newStatus = currentStatus === "done" ? "todo" : "done"
  const completed_at = newStatus === "done" ? new Date().toISOString() : null

  // Fetch the task to check recurrence
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase.from("tasks").update({ status: newStatus, completed_at }).eq("id", id)
  if (error) return { error: error.message }

  // If marking done and task has recurrence + due_date, spawn the next occurrence
  if (newStatus === "done" && task && task.recurrence !== "none" && task.due_date) {
    const current = new Date(task.due_date + "T12:00:00")
    let nextDate: Date
    if (task.recurrence === "daily") nextDate = addDays(current, 1)
    else if (task.recurrence === "weekly") nextDate = addWeeks(current, 1)
    else nextDate = addMonths(current, 1)

    await supabase.from("tasks").insert({
      user_id: user.id,
      title: task.title,
      description: task.description,
      due_date: format(nextDate, "yyyy-MM-dd"),
      priority: task.priority,
      status: "todo",
      recurrence: task.recurrence,
      task_category: task.task_category,
    })
  }

  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const title = formData.get("title") as string
  if (!title?.trim()) return { error: "Title is required" }

  const { error } = await supabase
    .from("tasks")
    .update({
      title: title.trim(),
      description: (formData.get("description") as string) || null,
      due_date: (formData.get("due_date") as string) || null,
      start_time: (formData.get("start_time") as string) || null,
      end_time: (formData.get("end_time") as string) || null,
      priority: (formData.get("priority") as string) || "medium",
      status: (formData.get("status") as string) || "todo",
      recurrence: (formData.get("recurrence") as string) || "none",
      task_category: (formData.get("task_category") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}

export async function deleteTask(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // Fetch calendar link before deleting
  const { data: task } = await supabase
    .from("tasks")
    .select("calendar_event_id, calendar_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  // Delete from Google Calendar if linked
  if (task?.calendar_event_id) {
    try {
      const { data: tokenRow } = await supabase
        .from("calendar_tokens")
        .select("access_token, refresh_token, expiry_date")
        .eq("user_id", user.id)
        .single()

      if (tokenRow) {
        const oauth2Client = getOAuthClient()
        oauth2Client.setCredentials({
          access_token: tokenRow.access_token,
          refresh_token: tokenRow.refresh_token,
          expiry_date: tokenRow.expiry_date,
        })
        const calendar = google.calendar({ version: "v3", auth: oauth2Client })
        await calendar.events.delete({
          calendarId: task.calendar_id ?? "primary",
          eventId: task.calendar_event_id,
        })
      }
    } catch {
      // Calendar deletion failed — still delete the task
    }
  }

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}
