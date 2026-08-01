"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { google } from "googleapis"

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

  // Mutual funds use manual balance / auto-contributions — never touch their price
  const refreshable = investments.filter((i) => i.asset_type !== "mutual fund")
  const priceMap = new Map<string, number>()
  const today = new Date().toISOString().slice(0, 10)

  // ── Stocks / ETFs / crypto via Yahoo Finance ──────────────────────────────
  const symbols = refreshable.map((i) => i.symbol).join(",")
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
    const missing = refreshable.filter((i) => !priceMap.has(i.symbol.toUpperCase()))
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
    const stillMissing = refreshable.filter((i) => !priceMap.has(i.symbol.toUpperCase()))
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

// ── Auto-contributions ────────────────────────────────────────────────────────

export async function applyAutoContributions(): Promise<{ applied: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { applied: 0 }

  const { data: rules, error: rulesErr } = await supabase
    .from("investment_auto_contributions")
    .select("id, symbol, amount, calendar_keyword, last_applied_event_date")
    .eq("user_id", user.id)

  if (rulesErr || !rules?.length) return { applied: 0 }

  const now = new Date()
  let totalApplied = 0

  for (const rule of rules) {
    // Compute the start boundary: day after last applied, or epoch
    let sinceDate: string
    if (rule.last_applied_event_date) {
      const d = new Date(rule.last_applied_event_date + "T00:00:00Z")
      d.setUTCDate(d.getUTCDate() + 1)
      sinceDate = d.toISOString().slice(0, 10)
    } else {
      sinceDate = "2000-01-01"
    }

    const keyword = (rule.calendar_keyword ?? "paycheck").toLowerCase()
    const todayIso = now.toISOString().slice(0, 10)

    // Local calendar events
    const { data: localEvents } = await supabase
      .from("local_calendar_events")
      .select("start_at")
      .eq("user_id", user.id)
      .ilike("title", `%${keyword}%`)
      .gte("start_at", sinceDate)
      .lte("start_at", todayIso)

    // Google Calendar events (best-effort)
    const googleDates: string[] = []
    try {
      const { data: tokenRow } = await supabase
        .from("calendar_tokens")
        .select("access_token, refresh_token, expiry_date")
        .eq("user_id", user.id)
        .single()

      if (tokenRow) {
        const oauth2 = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
        )
        oauth2.setCredentials({
          access_token: tokenRow.access_token,
          refresh_token: tokenRow.refresh_token,
          expiry_date: tokenRow.expiry_date,
        })
        oauth2.on("tokens", async (t) => {
          if (t.access_token) {
            await supabase.from("calendar_tokens").update({
              access_token: t.access_token,
              expiry_date: t.expiry_date ?? Date.now() + 3600000,
              ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
            }).eq("user_id", user.id)
          }
        })

        const cal = google.calendar({ version: "v3", auth: oauth2 })
        const { data: calList } = await cal.calendarList.list({ minAccessRole: "reader" })
        const results = await Promise.allSettled(
          (calList.items ?? []).map(async (c) => {
            const { data } = await cal.events.list({
              calendarId: c.id!,
              q: keyword,
              timeMin: sinceDate + "T00:00:00Z",
              timeMax: todayIso + "T23:59:59Z",
              singleEvents: true,
              maxResults: 100,
            })
            return (data.items ?? [])
              .filter((e) => (e.summary ?? "").toLowerCase().includes(keyword))
              .map((e) => (e.start?.dateTime ?? e.start?.date ?? "").slice(0, 10))
              .filter(Boolean)
          })
        )
        for (const r of results) {
          if (r.status === "fulfilled") googleDates.push(...r.value as string[])
        }
      }
    } catch { /* Google Calendar not connected */ }

    // Unique event dates (deduplicate local + Google by calendar date)
    const localDates = (localEvents ?? []).map((e) => (e.start_at as string).slice(0, 10))
    const uniqueDates = [...new Set([...localDates, ...googleDates])].filter(Boolean)

    if (uniqueDates.length === 0) continue

    uniqueDates.sort()
    const latestDate = uniqueDates[uniqueDates.length - 1]
    const addAmount = Number(rule.amount) * uniqueDates.length

    // Get current investment balance
    const { data: inv } = await supabase
      .from("investments")
      .select("id, current_price, avg_cost")
      .eq("user_id", user.id)
      .eq("symbol", rule.symbol)
      .single()

    if (!inv) continue

    const currentBalance = Number(inv.current_price ?? inv.avg_cost ?? 0)
    const newBalance = parseFloat((currentBalance + addAmount).toFixed(2))

    const { error: updErr } = await supabase
      .from("investments")
      .update({ current_price: newBalance, avg_cost: newBalance, updated_at: new Date().toISOString() })
      .eq("id", inv.id)
      .eq("user_id", user.id)

    if (updErr) continue

    await supabase
      .from("investment_auto_contributions")
      .update({ last_applied_event_date: latestDate })
      .eq("id", rule.id)
      .eq("user_id", user.id)

    totalApplied += uniqueDates.length
  }

  if (totalApplied > 0) revalidatePath("/investments")
  return { applied: totalApplied }
}

export async function upsertAutoContribution(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const symbol = (formData.get("symbol") as string)?.trim().toUpperCase()
  const amount = parseFloat(formData.get("amount") as string)
  const keyword = (formData.get("keyword") as string)?.trim().toLowerCase() || "paycheck"

  if (!symbol || isNaN(amount) || amount <= 0) return { error: "Invalid input" }

  const { error } = await supabase
    .from("investment_auto_contributions")
    .upsert(
      { user_id: user.id, symbol, amount, calendar_keyword: keyword },
      { onConflict: "user_id,symbol" }
    )

  if (error) return { error: error.message }
  return { success: true }
}

export async function buyMoreShares(id: string, additionalShares: number, pricePerShare: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: inv } = await supabase
    .from("investments")
    .select("shares, avg_cost")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!inv) return { error: "Investment not found" }

  const newShares = inv.shares + additionalShares
  const newAvgCost = (inv.shares * inv.avg_cost + additionalShares * pricePerShare) / newShares

  const { error } = await supabase
    .from("investments")
    .update({
      shares: parseFloat(newShares.toFixed(6)),
      avg_cost: parseFloat(newAvgCost.toFixed(4)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/investments")
  revalidatePath("/")
  return {}
}

export async function deleteAutoContribution(symbol: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("investment_auto_contributions")
    .delete()
    .eq("user_id", user.id)
    .eq("symbol", symbol.toUpperCase())

  if (error) return { error: error.message }
  return { success: true }
}
