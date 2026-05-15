import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(new URL("/calendar?error=access_denied", req.url))
  }

  try {
    const origin = new URL(req.url).origin
    const redirectUri = `${origin}/api/calendar/callback`

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    )
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(new URL("/calendar?error=missing_tokens", req.url))
    }

    // Get user's Google email
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    // Store tokens in Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL("/login", req.url))

    await supabase.from("calendar_tokens").upsert(
      {
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
        google_email: userInfo.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )

    return NextResponse.redirect(new URL("/calendar?connected=1", req.url))
  } catch {
    return NextResponse.redirect(new URL("/calendar?error=auth_failed", req.url))
  }
}
