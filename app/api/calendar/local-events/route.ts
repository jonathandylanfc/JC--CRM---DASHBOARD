import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data, error } = await supabase
    .from("local_calendar_events")
    .select("id, title, start_at, end_at, all_day, location, notes, color")
    .eq("user_id", user.id)
    .order("start_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json()
  const { title, start_at, end_at, all_day, location, notes, color } = body

  if (!title?.trim() || !start_at) {
    return NextResponse.json({ error: "Title and start date are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("local_calendar_events")
    .insert({
      user_id: user.id,
      title: title.trim(),
      start_at,
      end_at: end_at ?? null,
      all_day: all_day ?? false,
      location: location?.trim() ?? null,
      notes: notes?.trim() ?? null,
      color: color ?? "#10b981",
    })
    .select("id, title, start_at, end_at, all_day, location, notes, color")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase
    .from("local_calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
