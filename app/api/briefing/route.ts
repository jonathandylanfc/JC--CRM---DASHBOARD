import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import { Resend } from "resend"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

export async function POST(req: NextRequest) {
  try {
  // Optional: protect with a secret so only Railway cron can call this
  const secret = req.headers.get("x-briefing-secret")
  const expectedSecret = process.env.BRIEFING_SECRET
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not set — add it in Railway environment variables" }, { status: 500 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })

  // Get user (allow unauthenticated cron calls with a target email, or auth-based)
  let userEmail: string | null = null
  let userId: string | null = null

  const contentLength = req.headers.get("content-length")
  const body = contentLength && contentLength !== "0"
    ? await req.json().catch(() => ({}))
    : {}

  if (body.email) {
    userEmail = body.email
    userId = body.user_id ?? null
  } else {
    // Try cookie-based auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    userEmail = user.email ?? null
    userId = user.id
  }

  if (!userEmail) return NextResponse.json({ error: "No email address" }, { status: 400 })

  // Fetch portfolio
  const supabase = await createClient()
  let investments: Array<{ symbol: string; shares: number; avg_cost: number; current_price: number | null; name: string | null }> = []
  if (userId) {
    const { data } = await supabase
      .from("investments")
      .select("symbol, shares, avg_cost, current_price, name")
      .eq("user_id", userId)
    investments = data ?? []
  }

  const totalValue = investments.reduce((s, i) => s + i.shares * (i.current_price ?? i.avg_cost), 0)
  const totalCost = investments.reduce((s, i) => s + i.shares * i.avg_cost, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const holdingLines = investments.map((i) => {
    const val = i.shares * (i.current_price ?? i.avg_cost)
    const gain = val - i.shares * i.avg_cost
    const gainPct = i.avg_cost > 0 ? (gain / (i.shares * i.avg_cost)) * 100 : 0
    return `• ${i.symbol}${i.name ? ` (${i.name})` : ""}: ${i.shares} shares @ ${currency(i.current_price ?? i.avg_cost)} = ${currency(val)} (${pct(gainPct)})`
  }).join("\n")

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York",
  })

  const portfolioContext = investments.length > 0
    ? `Portfolio total: ${currency(totalValue)} (${pct(totalGainPct)} all-time)\n\nHoldings:\n${holdingLines}`
    : "No holdings tracked yet."

  // Fetch live market news & trending tickers from Alpha Vantage
  let newsContext = ""
  try {
    const avKey = process.env.ALPHA_VANTAGE_KEY
    if (avKey) {
      const newsRes = await fetch(
        `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&sort=LATEST&limit=30&apikey=${avKey}`,
        { signal: AbortSignal.timeout(6000) }
      )
      if (newsRes.ok) {
        const newsData = await newsRes.json()
        const feed: Array<{
          title: string
          summary: string
          ticker_sentiment?: Array<{ ticker: string; ticker_sentiment_label: string; relevance_score: string }>
        }> = newsData.feed ?? []

        // Build a compact news digest — top 12 headlines + most mentioned tickers
        const tickerMentions: Record<string, number> = {}
        const headlines = feed.slice(0, 12).map((item) => {
          for (const t of item.ticker_sentiment ?? []) {
            if (parseFloat(t.relevance_score) > 0.4) {
              tickerMentions[t.ticker] = (tickerMentions[t.ticker] ?? 0) + 1
            }
          }
          return `- ${item.title}`
        }).join("\n")

        const trending = Object.entries(tickerMentions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([ticker]) => ticker)
          .join(", ")

        newsContext = `\n\nLATEST MARKET NEWS (live as of now):\n${headlines}${trending ? `\n\nMost mentioned tickers in the news right now: ${trending}` : ""}`
      }
    }
  } catch {
    // News fetch failed — briefing continues without it
  }

  // Generate AI briefing
  const aiResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 900,
    system: `You are a concise personal finance assistant writing a morning market briefing email.
Today is ${today}. Be tight, actionable, and friendly. Structure your response in these sections:

1. MARKET PULSE — 2-3 sentences on general market sentiment and key macro factors today.
2. YOUR HOLDINGS — 1-2 bullet points on anything notable for the user's specific stocks.
3. STOCKS TO WATCH TODAY — Based on the live news and trending tickers provided, suggest 3-5 specific stocks worth researching today. For each give: ticker, why it's interesting right now (earnings, news catalyst, buzz), and a one-line note on what to look for. Be specific and direct.
4. QUICK TIP — One actionable personal finance tip.

Use plain text, no markdown symbols. Separate sections with a blank line and a clear label.
Start with a warm one-line greeting. Sign off as "JDpro AI — Your Morning Briefing".`,
    messages: [{
      role: "user",
      content: `My portfolio:\n${portfolioContext}${newsContext}\n\nWrite my morning briefing for ${today}.`,
    }],
  })

  const aiText = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : ""

  // Save briefing to DB so it can be displayed on the dashboard
  try {
    if (userId) {
      const briefingClient = await createClient()
      await briefingClient.rpc("insert_briefing", { p_user_id: userId, p_content: aiText })
    }
  } catch (e) {
    console.error("Failed to save briefing to DB:", e)
  }

  // Build HTML email
  const holdingRows = investments.length > 0
    ? investments.map((i) => {
        const val = i.shares * (i.current_price ?? i.avg_cost)
        const gain = val - i.shares * i.avg_cost
        const gainPct = i.avg_cost > 0 ? (gain / (i.shares * i.avg_cost)) * 100 : 0
        const color = gain >= 0 ? "#16a34a" : "#dc2626"
        return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 12px;font-weight:600;">${i.symbol}</td>
          <td style="padding:8px 12px;color:#6b7280;">${i.shares} sh</td>
          <td style="padding:8px 12px;">${i.current_price ? currency(i.current_price) : "—"}</td>
          <td style="padding:8px 12px;font-weight:600;color:${color};">${pct(gainPct)}</td>
          <td style="padding:8px 12px;text-align:right;">${currency(val)}</td>
        </tr>`
      }).join("")
    : ""

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center;">
        <p style="color:#c7d2fe;font-size:12px;margin:0 0 4px;">Morning Briefing</p>
        <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Good Morning ☀️</h1>
        <p style="color:#c7d2fe;font-size:13px;margin:8px 0 0;">${today}</p>
      </div>

      <!-- AI Briefing -->
      <div style="padding:24px;">
        <div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${aiText}</p>
        </div>

        ${investments.length > 0 ? `
        <!-- Portfolio snapshot -->
        <h2 style="font-size:15px;font-weight:600;margin:0 0 12px;color:#111827;">Your Portfolio</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Symbol</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Shares</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Price</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Return</th>
              <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600;">Value</th>
            </tr>
          </thead>
          <tbody>${holdingRows}</tbody>
          <tfoot>
            <tr style="background:#f9fafb;">
              <td colspan="4" style="padding:10px 12px;font-weight:700;">Total Portfolio</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;">${currency(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="font-size:12px;color:#9ca3af;margin:0 0 24px;">
          All-time gain: <strong style="color:${totalGain >= 0 ? "#16a34a" : "#dc2626"}">${totalGain >= 0 ? "+" : ""}${currency(totalGain)} (${pct(totalGainPct)})</strong>
        </p>
        ` : ""}

        <div style="text-align:center;margin-top:8px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://jdpro.app"}/investments"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;">
            View Dashboard →
          </a>
        </div>
      </div>

      <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px;text-align:center;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">JDpro · AI-powered personal finance dashboard</p>
        <p style="font-size:11px;color:#9ca3af;margin:4px 0 0;">This briefing is AI-generated and not financial advice.</p>
      </div>
    </div>
  </div>
</body>
</html>`

  const resend = new Resend(RESEND_KEY)
  const { error: sendError } = await resend.emails.send({
    from: "JDpro Briefing <onboarding@resend.dev>",
    to: [userEmail],
    subject: `☀️ Morning Briefing — ${today}`,
    html: htmlBody,
  })

  if (sendError) {
    console.error("Resend error:", sendError)
    return NextResponse.json({ error: `Email send failed: ${(sendError as { message?: string }).message ?? String(sendError)}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, sentTo: userEmail })
  } catch (err) {
    console.error("Briefing error:", err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Briefing failed: ${message}` }, { status: 500 })
  }
}

// GET: allow sending a briefing directly from the browser (authenticated)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  // Build a proper POST request that includes the user's email and id in the body
  // so the POST handler doesn't need to re-authenticate (cookies aren't forwarded on the synthetic request)
  const body = JSON.stringify({ email: user.email, user_id: user.id })
  const req = new Request("http://localhost/api/briefing", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(body.length) },
    body,
  })
  return POST(req as NextRequest)
}
