import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

// Errors that mean the item simply doesn't support investments — skip silently.
const SKIP_CODES = new Set([
  "PRODUCT_NOT_SUPPORTED",
  "PRODUCTS_NOT_SUPPORTED",
  "INVALID_PRODUCT",
  "ITEM_NOT_SUPPORTED",
  "NO_INVESTMENT_ACCOUNTS",
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const itemId: string | undefined = body.item_id

  // Get plaid items for this user (or specific item)
  const itemQuery = supabase
    .from("plaid_items")
    .select("id, access_token, item_id, institution_name")
    .eq("user_id", user.id)

  const { data: items } = itemId
    ? await itemQuery.eq("item_id", itemId)
    : await itemQuery

  if (!items || items.length === 0) return NextResponse.json({ count: 0 })

  let totalSynced = 0
  // Track items that need additional investment consent
  let consentNeededItem: { item_id: string; institution_name: string } | null = null

  for (const item of items) {
    try {
      const res = await plaidClient.investmentsHoldingsGet({
        access_token: item.access_token,
      })

      const { holdings, securities } = res.data

      // Build a map of security_id → security info
      const secMap = new Map(securities.map((s) => [s.security_id, s]))

      const rows = holdings
        .filter((h) => h.quantity > 0)
        .map((h) => {
          const sec = secMap.get(h.security_id)
          const symbol = sec?.ticker_symbol ?? sec?.name ?? "UNKNOWN"
          const name = sec?.name ?? null
          const assetType =
            sec?.type === "equity" ? "stock" :
            sec?.type === "etf" ? "etf" :
            sec?.type === "mutual fund" ? "mutual fund" :
            sec?.type === "cryptocurrency" ? "crypto" : "stock"

          return {
            user_id: user.id,
            symbol: symbol.toUpperCase().slice(0, 20),
            name,
            shares: h.quantity,
            avg_cost: h.cost_basis != null && h.quantity > 0
              ? h.cost_basis / h.quantity
              : (h.institution_price ?? 0),
            current_price: h.institution_price ?? null,
            asset_type: assetType,
          }
        })
        .filter((r) => r.symbol !== "UNKNOWN" && r.shares > 0)

      if (rows.length > 0) {
        const { error } = await supabase
          .from("investments")
          .upsert(rows, { onConflict: "user_id,symbol" })

        if (error) {
          console.error("investments upsert error:", error)
        } else {
          totalSynced += rows.length
        }
      }
    } catch (err: unknown) {
      // Extract Plaid-specific error details
      const plaidErr = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data
      const errorCode = plaidErr?.error_code ?? ""
      const msg = errorCode
        ? `${errorCode}: ${plaidErr?.error_message}`
        : (err instanceof Error ? err.message : String(err))

      console.warn(`investments sync skipped for item ${item.item_id} (${item.institution_name}):`, msg)

      if (errorCode === "ADDITIONAL_CONSENT_REQUIRED") {
        // This item needs user to re-authorize for investment access
        consentNeededItem = { item_id: item.item_id, institution_name: item.institution_name }
        // Continue to try other items
        continue
      }

      if (SKIP_CODES.has(errorCode)) {
        // This institution simply doesn't support investments — skip silently
        continue
      }

      // For PRODUCT_NOT_READY and other transient errors, return immediately with the error
      return NextResponse.json({ count: totalSynced, error: msg, item_id: item.item_id })
    }
  }

  // If any item needs consent, surface that after processing everything else
  if (consentNeededItem) {
    return NextResponse.json({
      count: totalSynced,
      error: `ADDITIONAL_CONSENT_REQUIRED: investment access not yet authorized for ${consentNeededItem.institution_name}`,
      item_id: consentNeededItem.item_id,
    })
  }

  return NextResponse.json({ count: totalSynced })
}
