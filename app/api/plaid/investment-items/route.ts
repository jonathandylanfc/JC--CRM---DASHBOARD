import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: items } = await supabase
    .from("plaid_items")
    .select("id, item_id, institution_name, created_at")
    .eq("user_id", user.id)
    .eq("is_investment_item", true)
    .order("created_at", { ascending: false })

  return NextResponse.json({ items: items ?? [] })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { item_id } = await req.json().catch(() => ({}))
  if (!item_id) return NextResponse.json({ error: "item_id required" }, { status: 400 })

  const { error } = await supabase
    .from("plaid_items")
    .delete()
    .eq("item_id", item_id)
    .eq("user_id", user.id)
    .eq("is_investment_item", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
