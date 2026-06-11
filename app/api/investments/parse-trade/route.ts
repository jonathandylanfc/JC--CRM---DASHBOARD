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
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Extract ALL executed trade details from this screenshot. It may be a TradingView order history table, balance history, a brokerage confirmation, or any trading platform.

Rules:
- SKIP any row where Status is "Cancelled", "Rejected", or "Pending" — only include "Filled" / executed orders
- For TradingView Order History tables: use the "Side" column directly for action (Buy→buy, Sell→sell), use "Fill price" as the price
- For TradingView Balance History: "Close long position"→sell, "Close short position"→buy, use the close price
- Strip exchange prefixes and punctuation from symbols: "CME_MINI:NQ1!" → "NQ1", "CME_MINI:NQM2026" → "NQM2026"
- Use "Placing time" or the timestamp shown as traded_at
- Put order type (Market/Limit/Stop) in notes

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "symbol": "ticker in uppercase, no exchange prefix or exclamation mark",
  "action": "buy" or "sell",
  "shares": number (quantity/units/contracts),
  "price": number (fill price / execution price per unit),
  "traded_at": "ISO 8601 datetime, infer year from context or use current year",
  "notes": "order type, entry price, P&L, or other useful info"
}

If a field is unknown use null. If there are no filled trades, return [].`,
          },
        ],
      }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]"
    const clean = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    const parsed = JSON.parse(clean)
    const trades = Array.isArray(parsed) ? parsed : [parsed]

    if (trades.length === 0) return NextResponse.json({ error: "No trades found in screenshot" }, { status: 422 })

    return NextResponse.json({ trades })
  } catch (err) {
    console.error("parse-trade error:", err)
    return NextResponse.json({ error: "Failed to parse screenshot" }, { status: 500 })
  }
}
