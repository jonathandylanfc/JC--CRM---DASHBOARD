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

  let category = (formData.get("category") as string)?.trim() || "other"
  const date =
    (formData.get("date") as string) || new Date().toISOString().split("T")[0]
  const clientId = (formData.get("id") as string) || undefined

  const accountName = (formData.get("account_name") as string) || null

  // Apply category mapping if one exists for this title
  const { data: mapping } = await supabase
    .from("category_mappings")
    .select("category")
    .eq("user_id", user.id)
    .ilike("title", title.trim())
    .maybeSingle()
  if (mapping?.category) category = mapping.category

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
      account_name: accountName,
    })
    .select("id, title, amount, type, category, date, notes, account_name, balance")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { transaction: saved }
}

export async function updateTransaction(id: string, formData: FormData) {
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
  const date = (formData.get("date") as string) || new Date().toISOString().split("T")[0]

  const { data: saved, error } = await supabase
    .from("transactions")
    .update({
      title: title.trim(),
      amount,
      type,
      category,
      date,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, amount, type, category, date, notes, balance, account_name")
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

export async function getTransactionCount(accountName?: string | null): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 0
  const q = supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
  const { count } = accountName ? await q.eq("account_name", accountName) : await q
  return count ?? 0
}

export async function deleteAccountTransactions(
  accountName: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("account_name", accountName)
  if (error) return { error: error.message }
  revalidatePath("/finance")
  revalidatePath("/")
  return {}
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
  accountName?: string | null,
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!rows.length) return { error: "No rows to import" }

  // Fetch category mappings to auto-categorize matching titles
  const { data: mappingRows } = await supabase
    .from("category_mappings")
    .select("title, category")
    .eq("user_id", user.id)
  const mappings = new Map((mappingRows ?? []).map((m) => [m.title.toLowerCase(), m.category]))

  const payload = rows.map((r) => ({
    title: r.title.slice(0, 255),
    amount: Math.abs(r.amount),
    type: r.type === "income" ? "income" : "expense",
    category: mappings.get(r.title.toLowerCase().trim()) ?? r.category,
    date: r.date,
    balance: r.balance ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("import_transactions_with_balance", {
    p_user_id: user.id,
    p_rows: payload,
    p_account_name: accountName ?? null,
  })

  if (error) return { error: (error as { message: string }).message }
  revalidatePath("/finance")
  revalidatePath("/")
  return { count: (data as number) ?? rows.length }
}
