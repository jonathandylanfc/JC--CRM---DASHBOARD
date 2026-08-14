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
  account: string | null
  commission: number | null
}

export async function saveDayTrade(trade: Omit<DayTrade, "id" | "total">): Promise<{ trade?: DayTrade; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const sanitized = { ...trade, commission: trade.commission != null ? Math.abs(trade.commission) : null }
  const { data, error } = await supabase
    .from("day_trades")
    .insert({ user_id: user.id, ...sanitized })
    .select("id, symbol, action, shares, price, total, traded_at, notes, account, commission")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { trade: data as DayTrade }
}

export async function updateTradeCommission(id: string, commission: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase
    .from("day_trades")
    .update({ commission: Math.abs(commission) })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return { error: error.message }
  return {}
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

export async function bulkDeleteDayTrades(ids: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!ids.length) return {}
  const { error } = await supabase
    .from("day_trades")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids)
  if (error) return { error: error.message }
  revalidatePath("/investments")
  return {}
}

export async function bulkSetTradeAccount(ids: string[], account: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!ids.length) return {}
  const { error } = await supabase
    .from("day_trades")
    .update({ account: account.trim() || null })
    .eq("user_id", user.id)
    .in("id", ids)
  if (error) return { error: error.message }
  revalidatePath("/investments")
  return {}
}
