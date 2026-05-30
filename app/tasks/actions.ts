"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { addDays, addWeeks, addMonths, format } from "date-fns"

export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const title = formData.get("title") as string
  if (!title?.trim()) return { error: "Title is required" }

  const due_date = formData.get("due_date") as string
  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: title.trim(),
    description: (formData.get("description") as string) || null,
    due_date: due_date || null,
    priority: (formData.get("priority") as string) || "medium",
    status: "todo",
    recurrence: (formData.get("recurrence") as string) || "none",
    task_category: (formData.get("task_category") as string) || null,
  })

  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}

export async function toggleTaskStatus(id: string, currentStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const newStatus = currentStatus === "done" ? "todo" : "done"

  // Fetch the task to check recurrence
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", id)
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
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}
