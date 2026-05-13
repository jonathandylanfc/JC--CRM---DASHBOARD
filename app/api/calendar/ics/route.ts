import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchAndParseIcs } from "@/lib/ics-parser"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: subs } = await supabase
    .from("ics_subscriptions")
    .select("id, name, ics_url, color")
    .eq("user_id", user.id)

  if (!subs || subs.length === 0) return NextResponse.json({ events: [], subscriptions: [] })

  const timeMin = new Date()
  timeMin.setDate(timeMin.getDate() - 30)
  const timeMax = new Date()
  timeMax.setDate(timeMax.getDate() + 60)

  const allEvents = await Promise.all(
    subs.map(async (sub) => {
      try {
        const parsed = await fetchAndParseIcs(sub.ics_url)
        return parsed
          .filter((e) => e.start >= timeMin && e.start <= timeMax)
          .map((e) => ({
            id: `ics-${sub.id}-${e.id}`,
            title: e.title,
            start: e.start.toISOString(),
            end: e.end ? e.end.toISOString() : null,
            allDay: e.allDay,
            location: e.location,
            description: e.description,
            color: sub.color,
            htmlLink: null,
            calendarName: sub.name,
            source: "ics" as const,
          }))
      } catch {
        return []
      }
    })
  )

  return NextResponse.json({
    events: allEvents.flat().sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
    subscriptions: subs,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { name, ics_url, color } = await req.json()
  if (!name?.trim() || !ics_url?.trim()) {
    return NextResponse.json({ error: "Name and URL are required" }, { status: 400 })
  }

  // Normalize webcal:// → https://
  const normalizedUrl = ics_url.trim().replace(/^webcal:\/\//i, "https://")

  // Validate it's a real ICS feed
  try {
    await fetchAndParseIcs(normalizedUrl)
  } catch {
    return NextResponse.json(
      { error: "Could not read that calendar URL. Make sure it's a valid .ics link." },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("ics_subscriptions")
    .insert({ user_id: user.id, name: name.trim(), ics_url: normalizedUrl, color: color ?? "#8b5cf6" })
    .select("id, name, ics_url, color")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscription: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await req.json()
  await supabase.from("ics_subscriptions").delete().eq("id", id).eq("user_id", user.id)
  return NextResponse.json({ success: true })
}
