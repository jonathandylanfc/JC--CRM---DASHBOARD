"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function upsertInvestment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const symbol = (formData.get("symbol") as string)?.trim().toUpperCase()
  if (!symbol) return { error: "Symbol is required" }

  const shares = parseFloat(formData.get("shares") as string)
  const avg_cost = parseFloat(formData.get("avg_cost") as string)
  if (isNaN(shares) || shares <= 0) return { error: "Valid share count required" }
  if (isNaN(avg_cost) || avg_cost < 0) return { error: "Valid avg cost required" }

  const name = (formData.get("name") as string)?.trim() || null
  const sector = (formData.get("sector") as string)?.trim() || null
  const asset_type = (formData.get("asset_type") as string) || "stock"
  const current_price = formData.get("current_price")
    ? parseFloat(formData.get("current_price") as string)
    : null

  const { data, error } = await supabase
    .from("investments")
    .upsert(
      { user_id: user.id, symbol, name, shares, avg_cost, current_price, sector, asset_type, updated_at: new Date().toISOString() },
      { onConflict: "user_id,symbol" }
    )
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { investment: data }
}

export async function deleteInvestment(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { success: true }
}

export async function bulkUpsertInvestments(
  rows: Array<{ symbol: string; name?: string; shares: number; avg_cost: number; current_price?: number; asset_type?: string }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  if (!rows.length) return { count: 0 }

  const records = rows.map((r) => ({
    user_id: user.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name ?? null,
    shares: r.shares,
    avg_cost: r.avg_cost,
    current_price: r.current_price ?? null,
    asset_type: r.asset_type ?? "stock",
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from("investments")
    .upsert(records, { onConflict: "user_id,symbol" })

  if (error) return { error: error.message }
  revalidatePath("/investments")
  return { count: records.length }
}

export async function refreshPrices() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: investments } = await supabase
    .from("investments")
    .select("id, symbol")
    .eq("user_id", user.id)

  if (!investments?.length) return { updated: 0 }

  let updated = 0
  for (const inv of investments) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${inv.symbol}?interval=1d&range=1d`,
        { next: { revalidate: 0 } }
      )
      const json = await res.json()
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (price) {
        await supabase
          .from("investments")
          .update({ current_price: price, updated_at: new Date().toISOString() })
          .eq("id", inv.id)
          .eq("user_id", user.id)
        updated++
      }
    } catch {}
  }

  revalidatePath("/investments")
  return { updated }
}
