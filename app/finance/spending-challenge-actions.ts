"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export interface SpendingChallenge {
  id: string
  card_name: string
  bonus_description: string
  spend_target: number
  spent_amount: number
  enrolled_at: string
  deadline: string
}

export async function getSpendingChallenges(): Promise<SpendingChallenge[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from("spending_challenges")
    .select("id, card_name, bonus_description, spend_target, spent_amount, enrolled_at, deadline")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return (data ?? []) as SpendingChallenge[]
}

export async function saveSpendingChallenge(challenge: Omit<SpendingChallenge, "id">): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { data, error } = await supabase
    .from("spending_challenges")
    .insert({ user_id: user.id, ...challenge })
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
