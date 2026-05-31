"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function addDividend(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const symbol = (formData.get("symbol") as string)?.toUpperCase().trim()
  const amount_per_share = parseFloat(formData.get("amount_per_share") as string)
  const frequency = formData.get("frequency") as string
  const ex_dividend_date = (formData.get("ex_dividend_date") as string) || null
  const pay_date = (formData.get("pay_date") as string) || null
  const shares_held_raw = formData.get("shares_held") as string
  const shares_held = shares_held_raw ? parseFloat(shares_held_raw) : null

  if (!symbol) return { error: "Symbol is required" }
  if (isNaN(amount_per_share) || amount_per_share <= 0) return { error: "Amount per share must be > 0" }

  const { error } = await supabase.from("dividends").insert({
    user_id: user.id,
    symbol,
    amount_per_share,
    frequency: frequency || "quarterly",
    ex_dividend_date,
    pay_date,
    shares_held,
  })

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { success: true }
}

export async function deleteDividend(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase.from("dividends").delete().eq("id", id).eq("user_id", user.id)
  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { success: true }
}
