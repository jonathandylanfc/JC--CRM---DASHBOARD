"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export interface DayTrade {
  id: string
  symbol: string
  action: "buy" | "sell"
  shares: number
  price: number
  total: number
  traded_at: string
  notes: string | null
}

export async function saveDayTrade(trade: Omit<DayTrade, "id" | "total">): Promise<{ trade?: DayTrade; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data, error } = await supabase
    .from("day_trades")
    .insert({ user_id: user.id, ...trade })
    .select("id, symbol, action, shares, price, total, traded_at, notes")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { trade: data as DayTrade }
}

export async function deleteDayTrade(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("day_trades")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return {}
}
