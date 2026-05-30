import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { data: investments } = await supabase
      .from("investments")
      .select("symbol, name, shares, avg_cost, current_price, sector, asset_type")
      .eq("user_id", user.id)

    if (!investments?.length) {
      return NextResponse.json({ insights: [], summary: null })
    }

    const totalCost = investments.reduce((s, i) => s + i.shares * i.avg_cost, 0)
    const totalValue = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
    const totalGainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

    const holdingsSummary = investments.map((inv) => {
      const value = inv.shares * (inv.current_price ?? inv.avg_cost)
      const gainPct = inv.avg_cost > 0
        ? ((inv.current_price ?? inv.avg_cost) - inv.avg_cost) / inv.avg_cost * 100
        : 0
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0
      return `${inv.symbol}${inv.name ? ` (${inv.name})` : ""}: ${inv.shares} shares, avg cost $${inv.avg_cost.toFixed(2)}, current $${(inv.current_price ?? inv.avg_cost).toFixed(2)}, ${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% gain, ${weight.toFixed(1)}% of portfolio${inv.sector ? `, sector: ${inv.sector}` : ""}${inv.asset_type !== "stock" ? `, type: ${inv.asset_type}` : ""}`
    }).join("\n")

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    })

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `You are a sharp, concise investment analyst. Today is ${today}.

Portfolio overview:
- Total invested: $${totalCost.toFixed(2)}
- Current value: $${totalValue.toFixed(2)}
- Overall return: ${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%

Holdings:
${holdingsSummary}

Generate exactly 4 short, specific insights about this portfolio for today. Cover:
1. A key thing to watch in the market today that affects these holdings
2. The biggest opportunity or risk in this specific portfolio right now
3. One holding-specific observation (price target, technical level, catalyst)
4. A brief overall portfolio health note

Rules:
- Each insight is 1-2 sentences max, direct and specific
- Use actual ticker symbols and numbers
- No generic platitudes — make it feel like real analyst commentary
- Format as a JSON array of objects: [{"icon": "emoji", "text": "insight"}]
- Use these icons: 👁️ for watchlist, ⚡ for opportunity/risk, 🎯 for specific target, 📊 for portfolio health

Respond with ONLY valid JSON.`
      }]
    })

    const raw = message.content[0].type === "text" ? message.content[0].text : "[]"
    const match = raw.match(/\[[\s\S]*\]/)
    const insights = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ insights, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error("AI insights error:", err)
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 })
  }
}
