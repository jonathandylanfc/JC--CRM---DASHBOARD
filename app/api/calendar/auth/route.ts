import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/calendar/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  })

  return NextResponse.redirect(url)
}
