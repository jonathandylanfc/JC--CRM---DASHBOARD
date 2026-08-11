import { createClient } from "@/lib/supabase/server"
import { google } from "googleapis"
import { createDAVClient } from "tsdav"
import { parseIcs } from "@/lib/ics-parser"

export interface PeriodShift {
  id: string
  title: string
  start_at: string
  end_at: string | null
  all_day: boolean
}

function inPeriod(start: string | null | undefined, pStart: Date, pEnd: Date): boolean {
  if (!start) return false
  const d = start.slice(0, 10)
  return d >= pStart.toISOString().slice(0, 10) && d <= pEnd.toISOString().slice(0, 10)
}

function matchesKeyword(title: string, keyword: string, excludeKeyword: string | null): boolean {
  const t = title.toLowerCase()
  if (!t.includes(keyword.toLowerCase())) return false
  if (excludeKeyword?.trim() && t.includes(excludeKeyword.toLowerCase().trim())) return false
  return true
}

export async function getGoogleCalendarShiftsForPeriod(
  periodStart: Date,
  periodEnd: Date,
  keyword: string,
  excludeKeyword: string | null
): Promise<PeriodShift[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: tokenRow } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", user.id)
    .single()

  if (!tokenRow) return []

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
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
          ...(newTokens.refresh_token ? { refresh_token: newTokens.refresh_token } : {}),
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id)
      }
    })

    const calendar = google.calendar({ version: "v3", auth: oauth2Client })
    const { data: calList } = await calendar.calendarList.list({ minAccessRole: "reader" })
    const cals = calList.items ?? []

    const timeMin = new Date(periodStart)
    timeMin.setHours(0, 0, 0, 0)
    const timeMax = new Date(periodEnd)
    timeMax.setHours(23, 59, 59, 999)

    const results = await Promise.all(
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
          return (data.items ?? [])
            .map((e) => ({
              start: e.start?.dateTime ?? e.start?.date ?? null,
              end: e.end?.dateTime ?? e.end?.date ?? null,
              title: e.summary ?? "(No title)",
              id: e.id ?? `gcal-${e.start?.dateTime ?? e.start?.date}`,
              allDay: !e.start?.dateTime,
            }))
            .filter((e) => inPeriod(e.start, periodStart, periodEnd) && matchesKeyword(e.title, keyword, excludeKeyword))
            .map((e): PeriodShift => ({
              id: e.id,
              title: e.title,
              start_at: e.start!,
              end_at: e.end ?? null,
              all_day: e.allDay,
            }))
        } catch {
          return []
        }
      })
    )

    return results.flat()
  } catch {
    return []
  }
}

export async function getCalDAVShiftsForPeriod(
  periodStart: Date,
  periodEnd: Date,
  keyword: string,
  excludeKeyword: string | null
): Promise<PeriodShift[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: creds } = await supabase
    .from("caldav_credentials")
    .select("apple_id, app_password")
    .eq("user_id", user.id)
    .single()

  if (!creds) return []

  try {
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: creds.apple_id, password: creds.app_password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    })

    const calendars = await client.fetchCalendars()

    const timeMin = new Date(periodStart)
    timeMin.setHours(0, 0, 0, 0)
    const timeMax = new Date(periodEnd)
    timeMax.setHours(23, 59, 59, 999)

    const results = await Promise.all(
      calendars.map(async (cal) => {
        try {
          const objects = await client.fetchCalendarObjects({
            calendar: cal,
            timeRange: { start: timeMin.toISOString(), end: timeMax.toISOString() },
          })
          return objects.flatMap((obj) => {
            if (!obj.data) return []
            try {
              return parseIcs(obj.data)
                .filter((e) => inPeriod(e.start, periodStart, periodEnd) && matchesKeyword(e.title, keyword, excludeKeyword))
                .map((e): PeriodShift => ({
                  id: `caldav-${e.id}`,
                  title: e.title,
                  start_at: e.start,
                  end_at: e.end ?? null,
                  all_day: e.allDay,
                }))
            } catch {
              return []
            }
          })
        } catch {
          return []
        }
      })
    )

    return results.flat()
  } catch {
    return []
  }
}
