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

  const { error } = await supabase.from("transactions").insert({
    ...(clientId ? { id: clientId } : {}),
    user_id: user.id,
    title: title.trim(),
    amount,
    type,
    category,
    date,
    notes: (formData.get("notes") as string) || null,
  })

  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { success: true }
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

export async function importTransactions(
  rows: ImportRow[],
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!rows.length) return { error: "No rows to import" }

  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id: user.id,
      title: r.title.slice(0, 255),
      amount: Math.abs(r.amount),
      type: r.type === "income" ? "income" : "expense",
      category: r.category,
      date: r.date,
      notes: null,
    })),
  )
  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { count: rows.length }
}
