import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createDAVClient } from "tsdav"

async function getDAVClient(appleId: string, appPassword: string) {
  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: { username: appleId, password: appPassword },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  })
}

// GET — list iCloud calendars (or return connection status)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: creds } = await supabase
    .from("caldav_credentials")
    .select("apple_id, app_password")
    .eq("user_id", user.id)
    .single()

  if (!creds) return NextResponse.json({ connected: false })

  try {
    const client = await getDAVClient(creds.apple_id, creds.app_password)
    const calendars = await client.fetchCalendars()
    return NextResponse.json({
      connected: true,
      appleId: creds.apple_id,
      calendars: calendars.map((c) => ({
        url: c.url,
        displayName: c.displayName ?? "iCloud Calendar",
        color: (c as { calendarColor?: string }).calendarColor ?? "#157EFB",
      })),
    })
  } catch {
    return NextResponse.json({ connected: false, error: "Invalid credentials" })
  }
}

// POST — connect (save credentials) or add an event
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json()

  // Connect flow: save credentials
  if (body.action === "connect") {
    const { appleId, appPassword } = body
    if (!appleId || !appPassword) return NextResponse.json({ error: "Missing credentials" }, { status: 400 })

    // Verify credentials work before saving
    try {
      const client = await getDAVClient(appleId, appPassword)
      await client.fetchCalendars()
    } catch {
      return NextResponse.json({ error: "Could not connect — check your Apple ID and app-specific password" }, { status: 401 })
    }

    await supabase.from("caldav_credentials").upsert(
      { user_id: user.id, apple_id: appleId, app_password: appPassword, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    return NextResponse.json({ success: true })
  }

  // Add event flow
  if (body.action === "add-event") {
    const { calendarUrl, title, date, startTime, endTime, notes } = body
    if (!calendarUrl || !title || !date) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })

    const { data: creds } = await supabase
      .from("caldav_credentials")
      .select("apple_id, app_password")
      .eq("user_id", user.id)
      .single()

    if (!creds) return NextResponse.json({ error: "iCloud not connected" }, { status: 400 })

    try {
      const client = await getDAVClient(creds.apple_id, creds.app_password)
      const uid = crypto.randomUUID()
      const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"

      let icsContent: string
      if (startTime) {
        const start = `${date}T${startTime}:00`.replace(/[-:]/g, "").slice(0, 15)
        const end = endTime
          ? `${date}T${endTime}:00`.replace(/[-:]/g, "").slice(0, 15)
          : `${date}T${String(parseInt(startTime.split(":")[0]) + 1).padStart(2, "0")}${startTime.split(":")[1]}00`.replace(/[-:]/g, "").slice(0, 15)

        icsContent = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//JDpro//EN",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${now}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:${title}`,
          notes ? `DESCRIPTION:${notes}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ].filter(Boolean).join("\r\n")
      } else {
        const dateStr = date.replace(/-/g, "")
        const nextDay = new Date(date + "T12:00:00")
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDayStr = nextDay.toISOString().slice(0, 10).replace(/-/g, "")

        icsContent = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//JDpro//EN",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${dateStr}`,
          `DTEND;VALUE=DATE:${nextDayStr}`,
          `SUMMARY:${title}`,
          notes ? `DESCRIPTION:${notes}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ].filter(Boolean).join("\r\n")
      }

      await client.createCalendarObject({
        calendar: { url: calendarUrl } as Parameters<typeof client.createCalendarObject>[0]["calendar"],
        filename: `${uid}.ics`,
        iCalString: icsContent,
      })

      return NextResponse.json({ success: true })
    } catch (err) {
      console.error("CalDAV add event error:", err)
      return NextResponse.json({ error: "Failed to add event to iCloud" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// DELETE — disconnect iCloud
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  await supabase.from("caldav_credentials").delete().eq("user_id", user.id)
  return NextResponse.json({ success: true })
}
