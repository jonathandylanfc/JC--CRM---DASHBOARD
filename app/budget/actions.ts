"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function createBudgetCategory(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = formData.get("type") as string
  if (type !== "percentage" && type !== "fixed") return { error: "Invalid type" }

  const value = parseFloat(formData.get("value") as string)
  if (isNaN(value) || value < 0) return { error: "Valid value is required" }

  const { count } = await supabase
    .from("budget_categories")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)

  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ user_id: user.id, name, type, value, sort_order: count ?? 0 })
    .select("id, name, type, value, sort_order")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { category: data }
}

export async function updateBudgetCategory(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = formData.get("type") as string
  if (type !== "percentage" && type !== "fixed") return { error: "Invalid type" }

  const value = parseFloat(formData.get("value") as string)
  if (isNaN(value) || value < 0) return { error: "Valid value is required" }

  const { data, error } = await supabase
    .from("budget_categories")
    .update({ name, type, value })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, type, value, sort_order")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { category: data }
}

export async function assignTransactionToCategory(
  transactionId: string,
  title: string,
  category: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // Re-categorize all transactions with this exact title (case-insensitive)
  const { error: txError } = await supabase
    .from("transactions")
    .update({ category })
    .eq("user_id", user.id)
    .ilike("title", title)

  if (txError) return { error: txError.message }

  // Save/update the mapping so future transactions are auto-categorized
  const { error: mapError } = await supabase
    .from("category_mappings")
    .upsert(
      { user_id: user.id, title: title.toLowerCase().trim(), category },
      { onConflict: "user_id,title" },
    )

  if (mapError) return { error: mapError.message }

  revalidatePath("/budget")
  revalidatePath("/finance")
  return {}
}

export async function bulkCreateBudgetCategories(
  names: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!names.length) return {}

  const rows = names.map((name, i) => ({
    user_id: user.id,
    name,
    type: "percentage" as const,
    value: 0,
    sort_order: i,
  }))

  const { error } = await supabase.from("budget_categories").insert(rows)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return {}
}

export async function deleteBudgetCategory(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("budget_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { success: true }
}

export async function toggleBudgetRollover(id: string, rollover: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("budget_categories")
    .update({ rollover })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { success: true }
}

export async function createSavingsGoal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }
  const target_amount = parseFloat(formData.get("target_amount") as string)
  const current_amount = parseFloat((formData.get("current_amount") as string) || "0")
  const target_date = (formData.get("target_date") as string) || null
  const color = (formData.get("color") as string) || "#8b5cf6"
  const monthly_contribution_type = (formData.get("monthly_contribution_type") as string) || null
  const monthly_contribution_value = formData.get("monthly_contribution_value")
    ? parseFloat(formData.get("monthly_contribution_value") as string)
    : null
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({ user_id: user.id, name, target_amount, current_amount, target_date, color, monthly_contribution_type, monthly_contribution_value })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { goal: data }
}

export async function updateSavingsGoal(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const name = (formData.get("name") as string)?.trim()
  const target_amount = parseFloat(formData.get("target_amount") as string)
  const current_amount = parseFloat((formData.get("current_amount") as string) || "0")
  const target_date = (formData.get("target_date") as string) || null
  const color = (formData.get("color") as string) || "#8b5cf6"
  const monthly_contribution_type = (formData.get("monthly_contribution_type") as string) || null
  const monthly_contribution_value = formData.get("monthly_contribution_value")
    ? parseFloat(formData.get("monthly_contribution_value") as string)
    : null
  const { error } = await supabase
    .from("savings_goals")
    .update({ name, target_amount, current_amount, target_date, color, monthly_contribution_type, monthly_contribution_value })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { success: true }
}

export async function logGoalContribution(id: string, amount: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("current_amount, target_amount")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!goal) return { error: "Goal not found" }
  const newAmount = Math.min(Number(goal.current_amount) + amount, Number(goal.target_amount))
  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: newAmount })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { success: true, newAmount }
}

export async function deleteSavingsGoal(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  return { success: true }
}

export async function setPaydayDay(day: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("profiles")
    .update({ payday_day: day })
    .eq("id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/budget")
  revalidatePath("/calendar")
  return { success: true }
}
