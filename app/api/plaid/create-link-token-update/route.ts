import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { plaidClient } from "@/lib/plaid"
import { CountryCode } from "plaid"

// Creates a Plaid Link token in "update mode" for an existing item.
// This lets the user re-authorize and grant investment consent to an
// institution that returned ADDITIONAL_CONSENT_REQUIRED.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { item_id } = await req.json().catch(() => ({}))
  if (!item_id) return NextResponse.json({ error: "item_id required" }, { status: 400 })

  const { data: item } = await supabase
    .from("plaid_items")
    .select("access_token")
    .eq("item_id", item_id)
    .eq("user_id", user.id)
    .single()

  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "JDpro",
      access_token: item.access_token,
      country_codes: [CountryCode.Us],
      language: "en",
    })
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err) {
    console.error("Plaid linkTokenCreate (update) error:", err)
    return NextResponse.json({ error: "Failed to create update link token" }, { status: 500 })
  }
}
