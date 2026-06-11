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
    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const mediaType = (file.type || "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif"

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Extract the trade details from this brokerage screenshot. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "symbol": "ticker symbol in uppercase",
  "action": "buy" or "sell",
  "shares": number,
  "price": number (price per share),
  "traded_at": "ISO 8601 datetime string, use today's date if only time is visible",
  "notes": "any additional info like order type, fees, account"
}
If you cannot determine a field, use null. If this is not a trade confirmation, return {"error": "Not a trade screenshot"}.`,
          },
        ],
      }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : ""
    const parsed = JSON.parse(text)

    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 422 })

    return NextResponse.json({ trade: parsed })
  } catch (err) {
    console.error("parse-trade error:", err)
    return NextResponse.json({ error: "Failed to parse screenshot" }, { status: 500 })
  }
}
