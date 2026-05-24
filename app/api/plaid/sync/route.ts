import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

function plaidCategory(cats: string[] | null): string {
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
    const { data: plaidAccounts } = await supabase
      .from("plaid_accounts")
      .select("account_id, name, mask")
      .eq("plaid_item_id", item.id)

    const accountLabelMap = new Map<string, string>()
    for (const acct of plaidAccounts ?? []) {
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
      })
      const { added, next_cursor, has_more } = res.data

      for (const tx of added) {
        if (tx.pending) continue

        const isIncome = tx.amount < 0
        const amount = Math.abs(tx.amount)
        const rawTitle = tx.merchant_name ?? tx.name
        const title = rawTitle.slice(0, 255)
        const category = mappings.get(title.toLowerCase()) ?? plaidCategory(tx.category ?? null)
        // Use per-account label; fall back to institution name if account not found
        const accountName = accountLabelMap.get(tx.account_id)
          ?? item.institution_name
          ?? "Bank"

        // Detect internal transfers (credit card payments, account-to-account moves)
        const isTransferCategory = category === "transfer"
        const isTransferTitle = /payment\s+(to|from)\s+(crd|chk|checking|savings|credit)|mobile banking payment|credit card payment|transfer\s+(to|from)|from\s+chk|to\s+crd/i.test(title)
        const txType = (isTransferCategory || isTransferTitle) ? "transfer" : (isIncome ? "income" : "expense")

        toInsert.push({
          title,
          amount,
          type: txType,
          category,
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

  // Auto-mark transfers after every Plaid sync
  if (totalAdded > 0) {
    const TRANSFER_KEYWORDS = [
      "payment from chk", "payment from checking", "payment from savings",
      "payment from sav", "mobile banking payment to crd", "mobile banking payment to credit",
      "online banking transfer", "online transfer", "transfer to checking",
      "transfer to savings", "transfer from checking", "transfer from savings",
      "ach transfer", "internal transfer", "account transfer", "funds transfer",
      "autopay payment", "automatic payment", "credit card payment",
    ]
    const { data: txns } = await supabase
      .from("transactions")
      .select("id, title")
      .eq("user_id", user.id)
      .neq("type", "transfer")
    const toMark = (txns ?? [])
      .filter((tx) => TRANSFER_KEYWORDS.some((kw) => tx.title.toLowerCase().includes(kw)))
      .map((tx) => tx.id)
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

  return NextResponse.json({ items: items ?? [] })
}
