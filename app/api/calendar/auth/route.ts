import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"

function getOrigin(req: NextRequest): string {
  // Railway (and most cloud proxies) set x-forwarded-host
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https"
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
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
