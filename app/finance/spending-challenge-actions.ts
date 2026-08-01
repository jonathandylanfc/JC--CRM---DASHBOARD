"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export interface SpendingChallenge {
  id: string
  card_name: string
  bonus_description: string
  spend_target: number
  spent_amount: number   // auto-computed from transactions if linked_account is set
  enrolled_at: string
  deadline: string
  linked_account: string | null
}

export async function getLinkedAccounts(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from("transactions")
    .select("account_name")
    .eq("user_id", user.id)
    .not("account_name", "is", null)
  const names = [...new Set((data ?? []).map((r) => r.account_name as string))].sort()
  return names
}

export async function getSpendingChallenges(): Promise<SpendingChallenge[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await supabase
    .from("spending_challenges")
    .select("id, card_name, bonus_description, spend_target, spent_amount, enrolled_at, deadline, linked_account")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (!rows?.length) return []

  // For challenges with a linked Plaid account, compute spent_amount live from transactions
  const result: SpendingChallenge[] = []
  for (const row of rows) {
    if (row.linked_account) {
      const { data: txData } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("account_name", row.linked_account)
        .eq("type", "expense")
        .gte("date", row.enrolled_at)
      const spent = (txData ?? []).reduce((s, t) => s + Number(t.amount), 0)
      result.push({ ...row, spent_amount: spent })
    } else {
      result.push(row as SpendingChallenge)
    }
  }
  return result
}

export async function saveSpendingChallenge(
  challenge: Omit<SpendingChallenge, "id" | "spent_amount">
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { data, error } = await supabase
    .from("spending_challenges")
    .insert({ user_id: user.id, ...challenge, spent_amount: 0 })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/finance")
  return { id: data.id }
}

export async function updateSpentAmount(id: string, spent_amount: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("spending_challenges")
    .update({ spent_amount })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/finance")
  return {}
}

export async function deleteSpendingChallenge(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("spending_challenges")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/finance")
  return {}
}
