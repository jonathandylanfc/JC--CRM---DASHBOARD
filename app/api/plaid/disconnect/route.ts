import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { item_id, delete_transactions } = await req.json()

  const { data: item } = await supabase
    .from("plaid_items")
    .select("id, access_token, institution_name")
    .eq("user_id", user.id)
    .eq("item_id", item_id)
    .single()

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Optionally delete all transactions for this institution
  if (delete_transactions && item.institution_name) {
    // Match both old format ("Bank of America") and new format ("Bank of America – Checking ••1234")
    await supabase
      .from("transactions")
      .delete()
      .eq("user_id", user.id)
      .or(`account_name.eq.${item.institution_name},account_name.like.${item.institution_name} –%`)
  }

  // Remove from Plaid
  await plaidClient.itemRemove({ access_token: item.access_token }).catch(() => {})

  // Remove from DB (cascades to accounts + cursors)
  await supabase.from("plaid_items").delete().eq("id", item.id)

  return NextResponse.json({ success: true })
}
