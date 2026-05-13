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

// Google color ID → hex
const GOOGLE_COLOR_HEX: Record<string, string> = {
  "1": "#4285f4", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
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

    // Fetch all calendars the user has
    const { data: calList } = await calendar.calendarList.list({ minAccessRole: "reader" })
    const cals = calList.items ?? []

    const timeMin = new Date()
    timeMin.setDate(timeMin.getDate() - 30)
    const timeMax = new Date()
    timeMax.setDate(timeMax.getDate() + 60)

    // Fetch events from all calendars in parallel
    const allEvents = await Promise.all(
      cals.map(async (cal) => {
        try {
          const { data } = await calendar.events.list({
            calendarId: cal.id!,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
          })
          const calColor = cal.backgroundColor ?? (cal.colorId ? GOOGLE_COLOR_HEX[cal.colorId] : null) ?? "#4285f4"
          return (data.items ?? []).map((e) => ({
            id: e.id,
            title: e.summary ?? "(No title)",
            start: e.start?.dateTime ?? e.start?.date ?? null,
            end: e.end?.dateTime ?? e.end?.date ?? null,
            allDay: !e.start?.dateTime,
            location: e.location ?? null,
            description: e.description ?? null,
            color: e.colorId ? GOOGLE_COLOR_HEX[e.colorId] : calColor,
            htmlLink: e.htmlLink ?? null,
            calendarName: cal.summary ?? "Google Calendar",
            source: "google" as const,
          }))
        } catch {
          return []
        }
      })
    )

    const events = allEvents.flat().sort((a, b) =>
      (a.start ?? "").localeCompare(b.start ?? "")
    )

    // Build calendar list for UI
    const calendarSources = cals.map((cal) => ({
      id: cal.id,
      name: cal.summary ?? "Calendar",
      color: cal.backgroundColor ?? (cal.colorId ? GOOGLE_COLOR_HEX[cal.colorId] : null) ?? "#4285f4",
      source: "google",
    }))

    return NextResponse.json({ events, googleEmail: tokenRow.google_email, calendarSources })
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 })
  }
}
