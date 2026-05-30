import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { message, history = [] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: "No message" }, { status: 400 })

    // Load portfolio for context
    const { data: investments } = await supabase
      .from("investments")
      .select("symbol, name, shares, avg_cost, current_price, sector, asset_type")
      .eq("user_id", user.id)

    const totalCost = (investments ?? []).reduce((s, i) => s + i.shares * i.avg_cost, 0)
    const totalValue = (investments ?? []).reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    const totalGainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

    const portfolioContext = investments?.length
      ? `Portfolio: $${totalCost.toFixed(2)} invested → $${totalValue.toFixed(2)} current (${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%)\n` +
        investments.map((inv) => {
          const gainPct = inv.avg_cost > 0
            ? ((inv.current_price ?? inv.avg_cost) - inv.avg_cost) / inv.avg_cost * 100
            : 0
          return `• ${inv.symbol}${inv.name ? ` (${inv.name})` : ""}: ${inv.shares} shares @ avg $${inv.avg_cost.toFixed(2)}, now $${(inv.current_price ?? inv.avg_cost).toFixed(2)} (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)${inv.sector ? `, ${inv.sector}` : ""}`
        }).join("\n")
      : "No holdings on file."

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    })

    const systemPrompt = `You are a sharp, knowledgeable investment analyst embedded in the user's personal finance dashboard. Today is ${today}.

The user's portfolio:
${portfolioContext}

You answer questions about their holdings, market conditions, investment strategy, and financial concepts. Be concise and direct — 2-4 sentences unless more detail is clearly needed. Use specific numbers from their portfolio when relevant. You can give analysis and opinions but always note you're not a licensed financial advisor.`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Build message history (cap at last 10 turns to control token usage)
    const recentHistory = history.slice(-10)

    const message_response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...recentHistory,
        { role: "user", content: message },
      ],
    })

    const reply = message_response.content[0].type === "text"
      ? message_response.content[0].text
      : "Sorry, I couldn't generate a response."

    return NextResponse.json({ reply })
  } catch (err) {
    console.error("AI chat error:", err)
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 })
  }
}
