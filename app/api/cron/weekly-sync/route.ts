import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { plaidClient } from "@/lib/plaid"

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
  isCredit: boolean,
  title: string
): { type: "income" | "expense" | "transfer"; category: string } {
  if (pfc) {
    const primary = pfc.primary
    const detailed = pfc.detailed
    if (primary === "INCOME") return { type: "income", category: "income" }
    if (primary === "LOAN_PAYMENTS") return { type: "transfer", category: "transfer" }
    if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") {
      const isZelleIn = detailed.includes("ZELLE") || detailed.includes("P2P") || /\bzelle\b.*\bfrom\b/i.test(title)
      if (primary === "TRANSFER_IN" && isZelleIn) return { type: "income", category: "income" }
      return { type: "transfer", category: "transfer" }
    }
    const cat = PFC_CATEGORY_MAP[primary] ?? legacyCategory(legacyCats)
    return { type: "expense", category: cat }
  }
  const cat = legacyCategory(legacyCats)
  const isZelleIncoming = /\bzelle\b.*\bfrom\b/i.test(title)
  const isCardPayment = /payment\s+to\s+.{0,40}card(\s+ending)?|payment\s+(to|from)\s+(crd|chk|checking|savings|credit)|mobile banking payment|credit card payment|transfer\s+(to|from)|from\s+chk|to\s+crd|payment\s*thank\s*you/i.test(title)
  if (isZelleIncoming) return { type: "income", category: "income" }
  if (cat === "transfer" || isCardPayment) return { type: "transfer", category: "transfer" }
  return { type: isCredit ? "income" : "expense", category: cat }
}

export async function GET(req: NextRequest) {
  // Validate cron secret
  const secret = req.headers.get("x-cron-secret")
  if (!process.env.PLAID_CRON_SECRET || secret !== process.env.PLAID_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (process.env.PLAID_SYNC_PAUSED === "true") {
    return NextResponse.json({ paused: true })
  }

  // Service role bypasses RLS so we can sync all users
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: items } = await supabase
    .from("plaid_items")
    .select("id, access_token, item_id, institution_name, user_id")
    .eq("is_investment_item", false)

  if (!items || items.length === 0) return NextResponse.json({ count: 0 })

  let totalAdded = 0
  const errors: string[] = []

  for (const item of items) {
    try {
      const { data: plaidAccounts } = await supabase
        .from("plaid_accounts")
        .select("account_id, name, mask, type")
        .eq("plaid_item_id", item.id)

      const investmentAccountIds = new Set(
        (plaidAccounts ?? []).filter((a) => a.type === "investment").map((a) => a.account_id)
      )

      const accountLabelMap = new Map<string, string>()
      for (const acct of plaidAccounts ?? []) {
        if (acct.type === "investment") continue
        const base = item.institution_name ?? "Bank"
        const label = acct.mask
          ? `${base} – ${acct.name} (••${acct.mask})`
          : `${base} – ${acct.name}`
        accountLabelMap.set(acct.account_id, label)
      }

      const { data: mappingRows } = await supabase
        .from("category_mappings")
        .select("title, category")
        .eq("user_id", item.user_id)
      const mappings = new Map((mappingRows ?? []).map((m) => [m.title.toLowerCase(), m.category]))

      const { data: cursorRow } = await supabase
        .from("plaid_sync_cursors")
        .select("cursor")
        .eq("plaid_item_id", item.id)
        .single()

      let cursor = cursorRow?.cursor ?? undefined
      let hasMore = true
      const toInsert: Array<{
        title: string; amount: number; type: string; category: string
        date: string; account_name: string
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
          toInsert.push({
            title, amount, type: txType,
            category: userMapping ?? inferredCategory,
            date: tx.date, account_name: accountName,
          })
        }

        cursor = next_cursor
        hasMore = has_more
      }

      if (toInsert.length > 0) {
        const byAccount = new Map<string, typeof toInsert>()
        for (const tx of toInsert) {
          const group = byAccount.get(tx.account_name) ?? []
          group.push(tx)
          byAccount.set(tx.account_name, group)
        }
        for (const [accountName, txs] of byAccount) {
          await (supabase as any).rpc("import_transactions_with_balance", {
            p_user_id: item.user_id,
            p_rows: txs.map((t) => ({
              title: t.title, amount: t.amount, type: t.type,
              category: t.category, date: t.date, balance: null,
            })),
            p_account_name: accountName,
          })
        }
        totalAdded += toInsert.length
      }

      await supabase.from("plaid_sync_cursors").upsert({
        user_id: item.user_id,
        plaid_item_id: item.id,
        cursor,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "plaid_item_id" })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Cron sync failed for item ${item.item_id}:`, msg)
      errors.push(`${item.institution_name}: ${msg}`)
    }
  }

  // Fix any misclassified transfers/Zelle across all synced users
  const userIds = [...new Set(items.map((i) => i.user_id))]
  for (const userId of userIds) {
    const { data: expenseTxns } = await supabase
      .from("transactions").select("id, title").eq("user_id", userId).eq("type", "expense")
    const TRANSFER_RE = /payment\s+(to|from)\s+(crd|chk|checking|savings|credit)|mobile banking payment|credit card payment|transfer\s+(to|from)|from\s+chk|to\s+crd|payment\s+to\s+.{0,40}card(\s+ending)?|online\s+(banking\s+)?transfer|ach transfer|internal transfer|account transfer|autopay payment|automatic payment|payment\s*thank\s*you/i
    const toMarkTransfer = (expenseTxns ?? []).filter((tx) => TRANSFER_RE.test(tx.title)).map((tx) => tx.id)
    if (toMarkTransfer.length) {
      await supabase.from("transactions").update({ type: "transfer" }).in("id", toMarkTransfer).eq("user_id", userId)
    }

    const { data: transferTxns } = await supabase
      .from("transactions").select("id, title").eq("user_id", userId).eq("type", "transfer")
    const ZELLE_IN_RE = /\bzelle\b.*\bfrom\b/i
    const toMarkIncome = (transferTxns ?? []).filter((tx) => ZELLE_IN_RE.test(tx.title)).map((tx) => tx.id)
    if (toMarkIncome.length) {
      await supabase.from("transactions").update({ type: "income", category: "income" }).in("id", toMarkIncome).eq("user_id", userId)
    }
  }

  return NextResponse.json({ count: totalAdded, errors: errors.length ? errors : undefined })
}
