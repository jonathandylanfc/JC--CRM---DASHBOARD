import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

// Legacy category array fallback (used when personal_finance_category is unavailable)
function legacyCategory(cats: string[] | null): string {
  if (!cats || cats.length === 0) return "other"
  const top = (cats[0] ?? "").toLowerCase()
  const sub = (cats[1] ?? "").toLowerCase()
  if (top === "food and drink") return "food"
  if (top === "shops") return "shopping"
  if (top === "transportation") {
    if (sub.includes("gas") || sub.includes("fuel")) return "gas"
    return "transportation"
  }
  if (top === "travel") return "travel"
  if (top === "recreation") return "entertainment"
  if (top === "healthcare") return "healthcare"
  if (top === "service") return "utilities"
  if (top === "payment" || top === "transfer") return "transfer"
  if (top === "bank fees") return "fees"
  if (top === "income") return "income"
  return "other"
}

const PFC_CATEGORY_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "food",
  GENERAL_MERCHANDISE: "shopping",
  TRANSPORTATION: "transportation",
  TRAVEL: "travel",
  ENTERTAINMENT: "entertainment",
  PERSONAL_CARE: "personal",
  MEDICAL: "healthcare",
  HOME_IMPROVEMENT: "home",
  RENT_AND_UTILITIES: "utilities",
  GENERAL_SERVICES: "utilities",
  BANK_FEES: "fees",
  GOVERNMENT_AND_NON_PROFIT: "other",
}

function classifyTransaction(
  pfc: { primary: string; detailed: string } | null | undefined,
  legacyCats: string[] | null,
  isCredit: boolean, // tx.amount < 0 in Plaid = money coming in
  title: string
): { type: "income" | "expense" | "transfer"; category: string } {
  if (pfc) {
    const primary = pfc.primary
    const detailed = pfc.detailed

    if (primary === "INCOME") return { type: "income", category: "income" }
    if (primary === "LOAN_PAYMENTS") return { type: "transfer", category: "transfer" }

    if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") {
      // Incoming Zelle / P2P = income, not a transfer
      if (primary === "TRANSFER_IN" && (detailed.includes("ZELLE") || detailed.includes("P2P"))) {
        return { type: "income", category: "income" }
      }
      return { type: "transfer", category: "transfer" }
    }

    const cat = PFC_CATEGORY_MAP[primary] ?? legacyCategory(legacyCats)
    return { type: "expense", category: cat }
  }

  // No PFC data — fall back to legacy category + amount sign + title heuristics
  const cat = legacyCategory(legacyCats)
  const isTransferCat = cat === "transfer"

  const isZelleIncoming = /\bzelle\b.*\bfrom\b/i.test(title)
  const isCardPayment = /payment\s+to\s+.{0,40}card(\s+ending)?|payment\s+(to|from)\s+(crd|chk|checking|savings|credit)|mobile banking payment|credit card payment|transfer\s+(to|from)|from\s+chk|to\s+crd|payment\s*thank\s*you/i.test(title)

  if (isZelleIncoming) return { type: "income", category: "income" }
  if (isTransferCat || isCardPayment) return { type: "transfer", category: "transfer" }
  return { type: isCredit ? "income" : "expense", category: cat }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const itemId: string | undefined = body.item_id // optional: sync specific item only

  // Get all items (or specific one)
  const itemQuery = supabase
    .from("plaid_items")
    .select("id, access_token, item_id, institution_name")
    .eq("user_id", user.id)
    .eq("is_investment_item", false) // investment items are handled by /api/plaid/investments-sync

  const { data: items } = itemId
    ? await itemQuery.eq("item_id", itemId)
    : await itemQuery

  if (!items || items.length === 0) return NextResponse.json({ count: 0 })

  // Fetch category mappings for auto-categorization
  const { data: mappingRows } = await supabase
    .from("category_mappings")
    .select("title, category")
    .eq("user_id", user.id)
  const mappings = new Map((mappingRows ?? []).map((m) => [m.title.toLowerCase(), m.category]))

  let totalAdded = 0

  for (const item of items) {
    // Build account_id → display label map for this item
    // Exclude investment-type accounts — their activity belongs on the Investments page, not Finance
    const { data: plaidAccounts } = await supabase
      .from("plaid_accounts")
      .select("account_id, name, mask, type")
      .eq("plaid_item_id", item.id)

    const investmentAccountIds = new Set(
      (plaidAccounts ?? []).filter((a) => a.type === "investment").map((a) => a.account_id)
    )

    const accountLabelMap = new Map<string, string>()
    for (const acct of plaidAccounts ?? []) {
      if (acct.type === "investment") continue // skip investment accounts
      const base = item.institution_name ?? "Bank"
      const label = acct.mask
        ? `${base} – ${acct.name} (••${acct.mask})`
        : `${base} – ${acct.name}`
      accountLabelMap.set(acct.account_id, label)
    }

    // Get cursor
    const { data: cursorRow } = await supabase
      .from("plaid_sync_cursors")
      .select("cursor")
      .eq("plaid_item_id", item.id)
      .single()

    let cursor = cursorRow?.cursor ?? undefined
    let hasMore = true
    const toInsert: Array<{
      title: string
      amount: number
      type: string
      category: string
      date: string
      account_name: string
    }> = []

    while (hasMore) {
      const res = await plaidClient.transactionsSync({
        access_token: item.access_token,
        cursor,
        options: { include_personal_finance_category: true },
      })
      const { added, next_cursor, has_more } = res.data

      for (const tx of added) {
        if (tx.pending) continue
        if (investmentAccountIds.has(tx.account_id)) continue

        const isCredit = tx.amount < 0
        const amount = Math.abs(tx.amount)
        const rawTitle = tx.merchant_name ?? tx.name
        const title = rawTitle.slice(0, 255)
        const accountName = accountLabelMap.get(tx.account_id) ?? item.institution_name ?? "Bank"

        const userMapping = mappings.get(title.toLowerCase())
        const { type: txType, category: inferredCategory } = classifyTransaction(
          tx.personal_finance_category ?? null,
          tx.category ?? null,
          isCredit,
          title
        )
        // User's explicit mapping overrides inferred category but not the type
        const finalCategory = userMapping ?? inferredCategory

        toInsert.push({
          title,
          amount,
          type: txType,
          category: finalCategory,
          date: tx.date,
          account_name: accountName,
        })
      }

      cursor = next_cursor
      hasMore = has_more
    }

    if (toInsert.length > 0) {
      // Group by account_name and call RPC once per account
      const byAccount = new Map<string, typeof toInsert>()
      for (const tx of toInsert) {
        const group = byAccount.get(tx.account_name) ?? []
        group.push(tx)
        byAccount.set(tx.account_name, group)
      }

      for (const [accountName, txs] of byAccount) {
        await (supabase as any).rpc("import_transactions_with_balance", {
          p_user_id: user.id,
          p_rows: txs.map((t) => ({
            title: t.title,
            amount: t.amount,
            type: t.type,
            category: t.category,
            date: t.date,
            balance: null,
          })),
          p_account_name: accountName,
        })
      }
      totalAdded += toInsert.length
    }

    // Update cursor
    await supabase.from("plaid_sync_cursors").upsert({
      user_id: user.id,
      plaid_item_id: item.id,
      cursor,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "plaid_item_id" })
  }

  // Catch any transfers the PFC classifier may have missed (runs every sync to fix existing rows too)
  {
    const { data: txns } = await supabase
      .from("transactions")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("type", "expense")
    const TRANSFER_RE = /payment\s+(to|from)\s+(crd|chk|checking|savings|credit)|mobile banking payment|credit card payment|transfer\s+(to|from)|from\s+chk|to\s+crd|payment\s+to\s+.{0,40}card(\s+ending)?|online\s+(banking\s+)?transfer|ach transfer|internal transfer|account transfer|autopay payment|automatic payment|payment\s*thank\s*you/i
    const toMark = (txns ?? []).filter((tx) => TRANSFER_RE.test(tx.title)).map((tx) => tx.id)
    if (toMark.length) {
      await supabase.from("transactions").update({ type: "transfer" }).in("id", toMark).eq("user_id", user.id)
    }
  }

  return NextResponse.json({ count: totalAdded })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ items: [] })

  const { data: items } = await supabase
    .from("plaid_items")
    .select(`
      id, item_id, institution_name,
      plaid_accounts(id, name, mask, type, subtype),
      plaid_sync_cursors(last_synced_at)
    `)
    .eq("user_id", user.id)
    .eq("is_investment_item", false) // investment items belong on the Investments page only

  return NextResponse.json({ items: items ?? [] })
}
