import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import { format, addDays, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday } from "date-fns"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function resolveDate(dayName: string, refDate: Date): string {
  const d = dayName.toLowerCase().trim()
  const today = new Date(refDate)
  today.setHours(0, 0, 0, 0)

  const map: Record<string, () => Date> = {
    monday: () => nextMonday(today),
    tuesday: () => nextTuesday(today),
    wednesday: () => nextWednesday(today),
    thursday: () => nextThursday(today),
    friday: () => nextFriday(today),
    saturday: () => nextSaturday(today),
    sunday: () => nextSunday(today),
    mon: () => nextMonday(today),
    tue: () => nextTuesday(today),
    wed: () => nextWednesday(today),
    thu: () => nextThursday(today),
    fri: () => nextFriday(today),
    sat: () => nextSaturday(today),
    sun: () => nextSunday(today),
  }

  if (map[d]) return format(map[d](), "yyyy-MM-dd")

  // Try to parse "Mon 5/19", "5/19", "May 19" etc.
  const slashMatch = dayName.match(/(\d{1,2})\/(\d{1,2})/)
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1
    const day = parseInt(slashMatch[2])
    const year = today.getFullYear()
    const date = new Date(year, month, day)
    if (date < today) date.setFullYear(year + 1)
    return format(date, "yyyy-MM-dd")
  }

  return format(today, "yyyy-MM-dd")
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("image") as File | null
  if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

  const today = format(new Date(), "yyyy-MM-dd")
  const prompt = `You are parsing a work schedule screenshot. Today is ${today}.

Extract all work shifts from this schedule image. Return ONLY valid JSON in this exact format:

{
  "events": [
    {
      "title": "Work Shift",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "notes": "any extra info like department or role if visible"
    }
  ]
}

Rules:
- Convert all times to 24-hour HH:MM format (e.g. "9:00 AM" → "09:00", "3:30 PM" → "15:30")
- For date: if you see a day name (Mon, Tuesday, etc.) use the next upcoming occurrence from today (${today})
- If you see specific dates like "5/19" or "May 19" use that exact date in YYYY-MM-DD format
- If a shift has no end time, omit end_time
- If you see "OFF" or "RDO" for a day, skip it
- Only include actual work shifts, not days off
- Return empty events array if no shifts found
- Do not include any text outside the JSON`

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    })

    const firstBlock = message.content[0]
    if (!firstBlock || firstBlock.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI" }, { status: 422 })
    }
    const responseText = firstBlock.text.trim()

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse schedule from image" }, { status: 422 })

    let parsed: { events?: unknown[] }
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: "Could not parse schedule from image" }, { status: 422 })
    }
    const events = parsed.events ?? []

    // Resolve relative day names to absolute dates
    const refDate = new Date()
    const resolved = events.map((e: { title: string; date: string; start_time?: string; end_time?: string; notes?: string }) => {
      // If date looks like a day name, resolve it
      const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(e.date)
      const resolvedDate = isDateFormat ? e.date : resolveDate(e.date, refDate)
      return { ...e, date: resolvedDate }
    })

    return NextResponse.json({ events: resolved })
  } catch (err) {
    console.error("Schedule parse error:", err)
    return NextResponse.json({ error: "Failed to parse schedule" }, { status: 500 })
  }
}
