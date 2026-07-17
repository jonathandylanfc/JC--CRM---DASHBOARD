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
    .select("id, symbol, asset_type")
    .eq("user_id", user.id)

  if (!investments?.length) return { updated: 0 }

  const mutualFunds = investments.filter((i) => i.asset_type === "mutual fund")
  const nonFunds = investments.filter((i) => i.asset_type !== "mutual fund")
  const priceMap = new Map<string, number>()
  const today = new Date().toISOString().slice(0, 10)

  // ── Mutual funds via Alpha Vantage GLOBAL_QUOTE ──────────────────────────
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  if (AV_KEY && mutualFunds.length > 0) {
    await Promise.allSettled(
      mutualFunds.map(async (inv) => {
        try {
          const res = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${inv.symbol}&apikey=${AV_KEY}`,
            { cache: "no-store", signal: AbortSignal.timeout(10000) }
          )
          const json = await res.json()
          console.log(`[AV] ${inv.symbol}:`, JSON.stringify(json))
          const price = parseFloat(json?.["Global Quote"]?.["05. price"] ?? "")
          if (!isNaN(price) && price > 0) priceMap.set(inv.symbol.toUpperCase(), price)
        } catch (e) {
          console.error(`[AV] ${inv.symbol} error:`, e)
        }
      })
    )
  } else {
    console.log("[AV] skipped — AV_KEY set:", !!AV_KEY, "mutualFunds:", mutualFunds.length)
  }

  // ── Stocks / ETFs / crypto via Yahoo Finance ──────────────────────────────
  const symbols = nonFunds.map((i) => i.symbol).join(",")
  if (symbols) {
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
          signal: AbortSignal.timeout(8000),
        }
      )
      if (res.ok) {
        const json = await res.json()
        const quotes = json?.quoteResponse?.result ?? []
        for (const q of quotes) {
          if (q.symbol && q.regularMarketPrice) priceMap.set(q.symbol.toUpperCase(), q.regularMarketPrice)
        }
      }
    } catch (e) {
      console.error("Yahoo Finance batch fetch failed:", e)
    }

    // Fall back to individual Yahoo Finance chart endpoint for missing symbols
    const missing = nonFunds.filter((i) => !priceMap.has(i.symbol.toUpperCase()))
    await Promise.allSettled(
      missing.map(async (inv) => {
        try {
          const res = await fetch(
            `https://query2.finance.yahoo.com/v8/finance/chart/${inv.symbol}?interval=1d&range=1d`,
            { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(6000) }
          )
          const json = await res.json()
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
          if (price) priceMap.set(inv.symbol.toUpperCase(), price)
        } catch {}
      })
    )

    // Stooq as final fallback
    const stillMissing = nonFunds.filter((i) => !priceMap.has(i.symbol.toUpperCase()))
    await Promise.allSettled(
      stillMissing.map(async (inv) => {
        try {
          const url = `https://stooq.com/q/l/?s=${inv.symbol.toLowerCase()}.us&f=sd2ohlcv&h&e=csv`
          const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) })
          if (!res.ok) return
          const text = await res.text()
          const lines = text.trim().split("\n")
          const cols = lines[1]?.split(",")
          const close = parseFloat(cols?.[5] ?? "")
          if (!isNaN(close) && close > 0) priceMap.set(inv.symbol.toUpperCase(), close)
        } catch {}
      })
    )
  }

  const refreshable = investments

  // Write all updated prices in parallel
  let updated = 0
  const snapshotRows: { user_id: string; symbol: string; price: number; snapshot_date: string }[] = []

  await Promise.allSettled(
    refreshable.map(async (inv) => {
      const price = priceMap.get(inv.symbol.toUpperCase())
      if (!price) return
      const { error } = await supabase
        .from("investments")
        .update({ current_price: price, updated_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("user_id", user.id)
      if (!error) {
        updated++
        snapshotRows.push({ user_id: user.id, symbol: inv.symbol.toUpperCase(), price, snapshot_date: today })
      }
    })
  )

  // Save timestamped snapshot so the 1D chart can show intraday movement
  if (snapshotRows.length > 0) {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    await supabase
      .from("investment_price_snapshots")
      .insert(snapshotRows.map((r) => ({ ...r, snapshot_date: today, snapshot_at: now })))
  }

  revalidatePath("/investments")
  revalidatePath("/")
  return { updated }
}
