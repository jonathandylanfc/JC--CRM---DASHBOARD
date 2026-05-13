import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { item_id } = await req.json()

  const { data: item } = await supabase
    .from("plaid_items")
    .select("id, access_token")
    .eq("user_id", user.id)
    .eq("item_id", item_id)
    .single()

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Remove from Plaid
  await plaidClient.itemRemove({ access_token: item.access_token }).catch(() => {})

  // Remove from DB (cascades to accounts + cursors)
  await supabase.from("plaid_items").delete().eq("id", item.id)

  return NextResponse.json({ success: true })
}
