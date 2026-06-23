import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
}

interface MatchInput {
  id: string
  date: string
  homeTeam: { name: string; abbr: string }
  awayTeam: { name: string; abbr: string }
  venue: string | null
  group: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json() as { matches: MatchInput[]; calendarId?: string }
  const { matches, calendarId = "primary" } = body

  if (!matches?.length) return NextResponse.json({ error: "No matches provided" }, { status: 400 })

  const { data: tokenRow } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", user.id)
    .single()

  if (!tokenRow) return NextResponse.json({ error: "not_connected" }, { status: 400 })

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

  // Look up any events we've already created for these match IDs
  const matchIds = matches.map((m) => m.id)
  const { data: existingRows } = await supabase
    .from("worldcup_calendar_events")
    .select("match_id, event_id")
    .eq("user_id", user.id)
    .in("match_id", matchIds)

  const existingMap = new Map<string, string>(
    (existingRows ?? []).map((r) => [r.match_id, r.event_id])
  )

  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const match of matches) {
    try {
      const startTime = new Date(match.date)
      const endTime = new Date(startTime.getTime() + 150 * 60 * 1000) // 2.5 hours

      const title = `${match.homeTeam.abbr} vs ${match.awayTeam.abbr} — FIFA World Cup 2026`
      const parts = ["2026 FIFA World Cup"]
      if (match.group) parts.push(`Group: ${match.group}`)
      if (match.venue) parts.push(`Venue: ${match.venue}`)

      const eventBody = {
        summary: title,
        description: parts.join("\n"),
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        reminders: { useDefault: true },
      }

      const existingEventId = existingMap.get(match.id)

      if (existingEventId) {
        // Update the existing calendar event with the latest team names
        try {
          await calendar.events.update({
            calendarId,
            eventId: existingEventId,
            requestBody: eventBody,
          })
          updated++
        } catch {
          // Event was deleted from calendar — re-create it
          const res = await calendar.events.insert({ calendarId, requestBody: eventBody })
          const newId = res.data.id!
          await supabase.from("worldcup_calendar_events").upsert({
            user_id: user.id, match_id: match.id, calendar_id: calendarId,
            event_id: newId, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,match_id" })
          created++
        }
      } else {
        // New event — insert and track the ID
        const res = await calendar.events.insert({ calendarId, requestBody: eventBody })
        const newId = res.data.id!
        await supabase.from("worldcup_calendar_events").upsert({
          user_id: user.id, match_id: match.id, calendar_id: calendarId,
          event_id: newId, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,match_id" })
        created++
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Failed to add/update World Cup match:", match.id, msg)
      const isAuthError =
        /insufficient/i.test(msg) || /forbidden/i.test(msg) ||
        /401|403/.test(msg) || /invalid_grant/i.test(msg)
      errors.push(isAuthError ? "__auth_error__" : match.id)
    }
  }

  if (errors.some(e => e === "__auth_error__")) {
    return NextResponse.json({ error: "reconnect_required", created, updated, errors })
  }
  return NextResponse.json({ created, updated, errors })
}
