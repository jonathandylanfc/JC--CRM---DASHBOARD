import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json() as {
    title: string
    due_date: string
    description?: string
    priority?: string
    start_time?: string
    end_time?: string
    reminder?: string  // minutes as string, e.g. "0", "15", "60"
  }

  const { title, due_date, description, priority, start_time, end_time, reminder } = body
  if (!title || !due_date) {
    return NextResponse.json({ error: "title and due_date are required" }, { status: 400 })
  }

  // Get Google OAuth tokens
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

  let eventDescription: string | undefined
  if (description && priority) {
    eventDescription = `${description}\n\nPriority: ${priority}`
  } else if (priority) {
    eventDescription = `Priority: ${priority}`
  } else if (description) {
    eventDescription = description
  }

  try {
    // Build start/end — timed event if times provided, all-day otherwise
    let startObj: { date?: string; dateTime?: string; timeZone?: string }
    let endObj: { date?: string; dateTime?: string; timeZone?: string }

    if (start_time) {
      startObj = { dateTime: `${due_date}T${start_time}:00`, timeZone: "America/New_York" }
      // If no end_time, default to 1 hour after start
      const endT = end_time ?? (() => {
        const [h, m] = start_time.split(":").map(Number)
        const endH = String(h + 1).padStart(2, "0")
        return `${endH}:${String(m).padStart(2, "0")}`
      })()
      endObj = { dateTime: `${due_date}T${endT}:00`, timeZone: "America/New_York" }
    } else {
      startObj = { date: due_date }
      endObj = { date: due_date }
    }

    const reminderMinutes = reminder != null ? parseInt(reminder) : null
    const reminders = reminderMinutes != null && !isNaN(reminderMinutes)
      ? { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] }
      : { useDefault: false, overrides: [] }

    const result = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description: eventDescription,
        start: startObj,
        end: endObj,
        reminders,
      },
    })

    return NextResponse.json({
      success: true,
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Failed to create calendar event for task:", msg)
    const isAuthError =
      /reconnect/i.test(msg) ||
      /invalid_grant/i.test(msg) ||
      /insufficient/i.test(msg) ||
      /forbidden/i.test(msg) ||
      /401|403/.test(msg)
    if (isAuthError) {
      return NextResponse.json({ error: "reconnect_required" }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
