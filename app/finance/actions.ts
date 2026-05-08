"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function createTransaction(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const title = formData.get("title") as string
  if (!title?.trim()) return { error: "Title is required" }

  const amount = parseFloat(formData.get("amount") as string)
  if (isNaN(amount) || amount <= 0) return { error: "Valid amount is required" }

  const type = formData.get("type") as string
  if (type !== "income" && type !== "expense") return { error: "Type must be income or expense" }

  const category = (formData.get("category") as string)?.trim() || "other"
  const date =
    (formData.get("date") as string) || new Date().toISOString().split("T")[0]
  const clientId = (formData.get("id") as string) || undefined

  const { data: saved, error } = await supabase
    .from("transactions")
    .insert({
      ...(clientId ? { id: clientId } : {}),
      user_id: user.id,
      title: title.trim(),
      amount,
      type,
      category,
      date,
      notes: (formData.get("notes") as string) || null,
    })
    .select("id, title, amount, type, category, date, notes")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { transaction: saved }
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("transactions").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { success: true }
}

export type ImportRow = {
  date: string
  title: string
  amount: number
  type: string
  category: string
  balance: number | null
}

export async function getTransactionCount(): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 0
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
  return count ?? 0
}

export async function deleteAllTransactions(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return {}
}

export async function deleteSelectedTransactions(
  ids: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!ids.length) return {}

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids)
  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return {}
}

export async function updateStartingBalance(
  amount: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("profiles")
    .update({ starting_balance: amount })
    .eq("id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/finance")
  return {}
}

export async function importTransactions(
  rows: ImportRow[],
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!rows.length) return { error: "No rows to import" }

  const payload = rows.map((r) => ({
    title: r.title.slice(0, 255),
    amount: Math.abs(r.amount),
    type: r.type === "income" ? "income" : "expense",
    category: r.category,
    date: r.date,
    balance: r.balance ?? null,
  }))

  const { data, error } = await supabase.rpc("import_transactions_with_balance", {
    p_user_id: user.id,
    p_rows: payload,
  })

  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { count: data ?? rows.length }
}
