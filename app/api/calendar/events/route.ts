import { google } from "googleapis"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: tokenRow } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expiry_date, google_email")
    .eq("user_id", user.id)
    .single()

  if (!tokenRow) return NextResponse.json({ error: "not_connected" }, { status: 200 })

  try {
    const oauth2Client = getOAuthClient()
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      expiry_date: tokenRow.expiry_date,
    })

    // Auto-refresh token if expired
    oauth2Client.on("tokens", async (newTokens) => {
      if (newTokens.access_token) {
        await supabase.from("calendar_tokens").update({
          access_token: newTokens.access_token,
          expiry_date: newTokens.expiry_date ?? Date.now() + 3600 * 1000,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id)
      }
    })

    const calendar = google.calendar({ version: "v3", auth: oauth2Client })

    // Fetch events for the next 60 days and past 30 days
    const timeMin = new Date()
    timeMin.setDate(timeMin.getDate() - 30)
    const timeMax = new Date()
    timeMax.setDate(timeMax.getDate() + 60)

    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    })

    const events = (data.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? "(No title)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: !e.start?.dateTime,
      location: e.location ?? null,
      description: e.description ?? null,
      color: e.colorId ?? null,
      htmlLink: e.htmlLink ?? null,
    }))

    return NextResponse.json({ events, googleEmail: tokenRow.google_email })
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 })
  }
}
