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

export async function deleteAllInvestments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/investments")
  revalidatePath("/")
  return { success: true }
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

  // Batch all symbols into a single Yahoo Finance request
  const symbols = investments.map((i) => i.symbol).join(",")
  const priceMap = new Map<string, number>()

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      }
    )

    if (res.ok) {
      const json = await res.json()
      const quotes = json?.quoteResponse?.result ?? []
      for (const q of quotes) {
        if (q.symbol && q.regularMarketPrice) {
          priceMap.set(q.symbol.toUpperCase(), q.regularMarketPrice)
        }
      }
    }
  } catch (e) {
    console.error("Yahoo Finance batch fetch failed:", e)
  }

  // If batch failed, fall back to individual fetches for missing symbols
  const missing = investments.filter((i) => !priceMap.has(i.symbol.toUpperCase()))
  await Promise.allSettled(
    missing.map(async (inv) => {
      try {
        const res = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${inv.symbol}?interval=1d&range=1d`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              "Accept": "application/json",
            },
            cache: "no-store",
          }
        )
        const json = await res.json()
        const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
        if (price) priceMap.set(inv.symbol.toUpperCase(), price)
      } catch {}
    })
  )

  // Write all updated prices in parallel
  let updated = 0
  await Promise.allSettled(
    investments.map(async (inv) => {
      const price = priceMap.get(inv.symbol.toUpperCase())
      if (!price) return
      const { error } = await supabase
        .from("investments")
        .update({ current_price: price, updated_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("user_id", user.id)
      if (!error) updated++
    })
  )

  revalidatePath("/investments")
  revalidatePath("/")
  return { updated }
}
