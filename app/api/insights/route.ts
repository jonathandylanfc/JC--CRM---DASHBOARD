import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Fetch last 3 months of expense transactions
    const threeMonthsAgo = format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd")
    const today = format(endOfMonth(new Date()), "yyyy-MM-dd")

    const { data: transactions } = await supabase
      .from("transactions")
      .select("amount, category, date, type")
      .eq("user_id", user.id)
      .eq("type", "expense")
      .gte("date", threeMonthsAgo)
      .lte("date", today)
      .order("date", { ascending: false })

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ insights: ["Add some transactions to get spending insights!"] })
    }

    // Summarize by category per month
    const summary: Record<string, Record<string, number>> = {}
    for (const tx of transactions) {
      const month = tx.date.slice(0, 7)
      const cat = tx.category?.toLowerCase() ?? "other"
      if (!summary[month]) summary[month] = {}
      summary[month][cat] = (summary[month][cat] ?? 0) + Number(tx.amount)
    }

    const summaryText = Object.entries(summary)
      .sort()
      .map(([month, cats]) =>
        `${month}: ${Object.entries(cats).map(([c, v]) => `${c} $${v.toFixed(0)}`).join(", ")}`
      ).join("\n")

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a friendly personal finance assistant. Based on this spending summary (last 3 months, category: $ spent), generate exactly 3 short, specific, actionable insights. Each insight should be 1-2 sentences max. Be encouraging, not judgmental. Format as a JSON array of strings.

Spending data:
${summaryText}

Respond with ONLY a valid JSON array like: ["insight 1", "insight 2", "insight 3"]`
      }]
    })

    const text = message.content[0].type === "text" ? message.content[0].text : "[]"
    const match = text.match(/\[[\s\S]*\]/)
    const insights = match ? JSON.parse(match[0]) : ["Keep tracking your spending to unlock insights!"]

    return NextResponse.json({ insights })
  } catch (err) {
    console.error("Insights error:", err)
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 })
  }
}
