import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function getPublicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https"
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  const origin = getPublicOrigin(req)

  if (error || !code) {
    return NextResponse.redirect(`${origin}/calendar?error=access_denied`)
  }

  try {
    const redirectUri = `${origin}/api/calendar/callback`

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    )
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${origin}/calendar?error=missing_tokens`)
    }

    // Get user's Google email
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    // Store tokens in Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(`${origin}/login`)

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

    return NextResponse.redirect(`${origin}/calendar?connected=1`)
  } catch {
    return NextResponse.redirect(`${origin}/calendar?error=auth_failed`)
  }
}
