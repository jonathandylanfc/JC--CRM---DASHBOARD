import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get("image") as File | null
    const type = (formData.get("type") as string | null) ?? "work"
    const timezone = (formData.get("timezone") as string | null) ?? "UTC"

    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const mediaType = (file.type || "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif"

    const now = new Date().toLocaleDateString("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const prompt = type === "sports"
      ? `Extract ALL game/match entries from this sports schedule screenshot.
Today's date is ${now} (timezone: ${timezone}). Use this to resolve relative dates and infer the year.

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "title": "opponent or event name, e.g. 'vs. Lakers' or 'Championship Game'",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM in 24-hour format, or null if unknown",
  "end_time": null,
  "notes": "location, home/away, or other details, or null"
}

If there are no games, return [].`
      : `Extract ALL work shifts from this schedule screenshot.
Today's date is ${now} (timezone: ${timezone}). Use this to resolve relative dates and infer the year.

Rules:
- Include every shift shown, even if dates span multiple weeks
- Times should be in 24-hour HH:MM format (e.g. "09:00", "17:30")
- Infer end time from duration labels if explicit end time is not shown (e.g. "8h shift starting 9am" → end_time "17:00")
- Do NOT include days off or blank/empty cells

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "title": "job role or position if shown, otherwise null",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM in 24-hour format, or null if unknown",
  "end_time": "HH:MM in 24-hour format, or null if unknown",
  "notes": "location, role, or other details, or null"
}

If there are no shifts, return [].`

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: prompt },
        ],
      }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]"
    const clean = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    const parsed = JSON.parse(clean)
    const events = Array.isArray(parsed) ? parsed : []

    return NextResponse.json({ events })
  } catch (err) {
    console.error("parse-schedule error:", err)
    return NextResponse.json({ error: "Failed to read schedule. Try a clearer screenshot." }, { status: 500 })
  }
}
