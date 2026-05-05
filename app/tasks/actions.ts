"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

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
  })

  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}

export async function toggleTaskStatus(id: string, currentStatus: string) {
  const supabase = await createClient()
  const newStatus = currentStatus === "done" ? "todo" : "done"
  const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}

export async function deleteTask(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("tasks").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath("/")
  return { success: true }
}
