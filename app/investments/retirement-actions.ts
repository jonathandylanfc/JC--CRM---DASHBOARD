"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface RetirementContrib {
  id: string
  name: string
  contribution_per_paycheck: number
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly"
  employer_match_pct: number
  current_balance: number
}

export async function getRetirementContributions(): Promise<RetirementContrib[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await supabase
      .from("retirement_contributions")
      .select("id, name, contribution_per_paycheck, pay_frequency, employer_match_pct, current_balance")
      .eq("user_id", user.id)
      .order("created_at")
    return (data ?? []) as RetirementContrib[]
  } catch {
    return []
  }
}

export async function upsertRetirementContribution(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const id = fd.get("id") as string | null
  const name = (fd.get("name") as string)?.trim()
  const contribution_per_paycheck = parseFloat(fd.get("contribution_per_paycheck") as string)
  const pay_frequency = fd.get("pay_frequency") as string
  const employer_match_pct = parseFloat(fd.get("employer_match_pct") as string) || 0
  const current_balance = parseFloat(fd.get("current_balance") as string) || 0

  if (!name) return { error: "Name is required" }
  if (isNaN(contribution_per_paycheck) || contribution_per_paycheck < 0) return { error: "Invalid contribution amount" }
  if (!["weekly", "biweekly", "semimonthly", "monthly"].includes(pay_frequency)) return { error: "Invalid pay frequency" }

  const payload = {
    user_id: user.id,
    name,
    contribution_per_paycheck,
    pay_frequency,
    employer_match_pct,
    current_balance,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase
      .from("retirement_contributions")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from("retirement_contributions")
      .insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath("/investments")
  return {}
}

export async function deleteRetirementContribution(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("retirement_contributions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return {}
}
