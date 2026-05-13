import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { public_token, institution } = await req.json()

  // Exchange public token for access token
  const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = exchangeRes.data

  // Store item
  const { data: item, error: itemError } = await supabase
    .from("plaid_items")
    .upsert({
      user_id: user.id,
      access_token,
      item_id,
      institution_name: institution?.name ?? null,
      institution_id: institution?.institution_id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "item_id" })
    .select("id")
    .single()

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

  // Fetch and store accounts
  const accountsRes = await plaidClient.accountsGet({ access_token })
  const accounts = accountsRes.data.accounts

  await supabase.from("plaid_accounts").upsert(
    accounts.map((a) => ({
      user_id: user.id,
      plaid_item_id: item.id,
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      mask: a.mask ?? null,
    })),
    { onConflict: "account_id" }
  )

  return NextResponse.json({ success: true, institution_name: institution?.name })
}
