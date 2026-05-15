import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

interface Shift {
  title: string
  date: string
  start_time?: string
  end_time?: string
  notes?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json() as { shifts: Shift[]; calendarId?: string; timezone?: string }
  const { shifts, calendarId = "primary", timezone = "America/New_York" } = body
  if (!shifts?.length) return NextResponse.json({ error: "No shifts provided" }, { status: 400 })

  // Get Google OAuth tokens
  const { data: tokenRow } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", user.id)
    .single()

  if (!tokenRow) return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 })

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

  const created: string[] = []
  const errors: string[] = []

  for (const shift of shifts) {
    try {
      const hasTime = !!shift.start_time

      const event = hasTime
        ? {
            summary: shift.title,
            description: shift.notes || "Work shift added via JDpro",
            colorId: "6", // orange
            start: { dateTime: `${shift.date}T${shift.start_time}:00`, timeZone: timezone },
            end: shift.end_time
              ? { dateTime: `${shift.date}T${shift.end_time}:00`, timeZone: timezone }
              : { dateTime: `${shift.date}T${shift.start_time}:00`, timeZone: timezone },
          }
        : {
            summary: shift.title,
            description: shift.notes || "Work shift added via JDpro",
            colorId: "6",
            start: { date: shift.date },
            end: { date: shift.date },
          }

      await calendar.events.insert({ calendarId, requestBody: event })
      created.push(shift.title)
    } catch (err) {
      console.error("Failed to add shift:", shift.title, err)
      errors.push(shift.title)
    }
  }

  return NextResponse.json({ created, errors })
}
