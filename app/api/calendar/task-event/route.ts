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
    task_id?: string
    title: string
    due_date: string
    description?: string
    priority?: string
    startUtc?: string
    endUtc?: string
    reminder?: string
  }

  const { task_id, title, due_date, description, priority, startUtc, endUtc, reminder } = body
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
    // Build start/end — use UTC ISO strings if provided, otherwise all-day
    let startObj: { date?: string; dateTime?: string }
    let endObj: { date?: string; dateTime?: string }

    if (startUtc) {
      startObj = { dateTime: startUtc }
      endObj = { dateTime: endUtc ?? new Date(new Date(startUtc).getTime() + 3600000).toISOString() }
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

    const eventId = result.data.id ?? null

    // Save the event ID back to the task so we can delete it later
    if (task_id && eventId) {
      await supabase.from("tasks")
        .update({ calendar_event_id: eventId, calendar_id: "primary" })
        .eq("id", task_id)
        .eq("user_id", user.id)
    }

    return NextResponse.json({
      success: true,
      eventId,
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

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json() as {
    eventId: string
    calendarId?: string
    title: string
    due_date: string
    startUtc?: string
    endUtc?: string
  }

  const { eventId, calendarId = "primary", title, due_date, startUtc, endUtc } = body
  if (!eventId || !title) return NextResponse.json({ error: "eventId and title are required" }, { status: 400 })

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

  try {
    let startObj: { date?: string; dateTime?: string }
    let endObj: { date?: string; dateTime?: string }

    if (startUtc) {
      startObj = { dateTime: startUtc }
      endObj = { dateTime: endUtc ?? new Date(new Date(startUtc).getTime() + 3600000).toISOString() }
    } else {
      startObj = { date: due_date }
      endObj = { date: due_date }
    }

    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: { summary: title, start: startObj, end: endObj },
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Failed to update calendar event:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
