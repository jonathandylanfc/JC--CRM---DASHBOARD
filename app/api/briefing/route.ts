import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import { Resend } from "resend"
import { google } from "googleapis"

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

  // Fetch weather from Open-Meteo (free, no key)
  let weatherContext = ""
  try {
    const lat = process.env.WEATHER_LAT ?? "38.0194"
    const lon = process.env.WEATHER_LON ?? "-122.1341"
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&current_weather=true&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (wRes.ok) {
      const wData = await wRes.json()
      const cur = wData.current_weather
      const daily = wData.daily
      const wmoDesc: Record<number, string> = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
        61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
        80: "Rain showers", 81: "Rain showers", 82: "Heavy rain showers", 95: "Thunderstorm",
      }
      const desc = wmoDesc[cur?.weathercode] ?? "Mixed conditions"
      const hi = daily?.temperature_2m_max?.[0]?.toFixed(0)
      const lo = daily?.temperature_2m_min?.[0]?.toFixed(0)
      const rain = daily?.precipitation_probability_max?.[0]
      weatherContext = `\n\nWEATHER TODAY (Martinez, CA): ${desc}, ${cur?.temperature?.toFixed(0)}°F now, High ${hi}°F / Low ${lo}°F${rain > 20 ? `, ${rain}% chance of rain` : ""}`
    }
  } catch {
    // Weather fetch failed — continue without it
  }

  // Fetch today's tasks + local + Google calendar events
  let tasksContext = ""
  let eventsContext = ""
  if (userId) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
    const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
    const [{ data: todayTasks }, { data: noDueTasks }, { data: localEvents }, { data: tokenRow }] = await Promise.all([
      supabase.from("tasks").select("title, priority").eq("user_id", userId)
        .eq("due_date", todayStr).neq("status", "done").order("priority"),
      supabase.from("tasks").select("title, priority").eq("user_id", userId)
        .is("due_date", null).neq("status", "done").order("priority").limit(10),
      supabase.from("local_calendar_events").select("title, start_at, all_day").eq("user_id", userId)
        .gte("start_at", `${todayStr}T00:00:00`).lte("start_at", `${tomorrowStr}T00:00:00`)
        .order("start_at"),
      supabase.from("calendar_tokens").select("access_token, refresh_token, expiry_date")
        .eq("user_id", userId).single(),
    ])

    const taskLines: string[] = []
    if (todayTasks?.length) taskLines.push(...todayTasks.map((t) => `• ${t.title} [due today, ${t.priority}]`))
    if (noDueTasks?.length) taskLines.push(...noDueTasks.map((t) => `• ${t.title} [no due date, ${t.priority}]`))
    if (taskLines.length) tasksContext = `\n\nTASKS TO DO:\n${taskLines.join("\n")}`

    // Combine local + Google calendar events
    const allEventLines: string[] = []

    if (localEvents?.length) {
      for (const e of localEvents) {
        const time = e.all_day ? "All day" : new Date(e.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })
        allEventLines.push(`• ${e.title} at ${time}`)
      }
    }

    // Fetch Google Calendar events if connected
    if (tokenRow) {
      try {
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2Client.setCredentials({ access_token: tokenRow.access_token, refresh_token: tokenRow.refresh_token, expiry_date: tokenRow.expiry_date })
        const calendar = google.calendar({ version: "v3", auth: oauth2Client })
        const { data: calList } = await calendar.calendarList.list({ minAccessRole: "reader" })
        const timeMin = new Date(`${todayStr}T00:00:00-07:00`).toISOString()
        const timeMax = new Date(`${todayStr}T23:59:59-07:00`).toISOString()
        const googleEvents = await Promise.all(
          (calList.items ?? []).map(async (cal) => {
            try {
              const { data } = await calendar.events.list({ calendarId: cal.id!, timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 20 })
              return data.items ?? []
            } catch { return [] }
          })
        )
        const seen = new Set<string>()
        for (const e of googleEvents.flat()) {
          if (!e.summary || seen.has(e.id ?? e.summary)) continue
          seen.add(e.id ?? e.summary)
          const isAllDay = !e.start?.dateTime
          const time = isAllDay ? "All day" : new Date(e.start!.dateTime!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })
          allEventLines.push(`• ${e.summary} at ${time}`)
        }
      } catch { /* Google fetch failed — continue without */ }
    }

    if (allEventLines.length) {
      eventsContext = `\n\nCALENDAR EVENTS TODAY:\n${allEventLines.join("\n")}`
    }
  }

  const NQ_COMPONENTS = new Set(["AAPL", "MSFT", "NVDA", "META", "AMZN", "GOOGL", "GOOG", "TSLA", "AVGO", "COST"])

  // Fetch live market news + NQ market data in parallel (all non-critical)
  let newsContext = ""
  let nqContext = ""

  const avKey = process.env.ALPHA_VANTAGE_KEY
  const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  const tomorrowDateStr = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })

  // Fetch high-impact economic calendar (ForexFactory public feed)
  let economicCalendarContext = ""
  try {
    const ffRes = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (ffRes.ok) {
      const ffData: Array<{ date: string; time: string; country: string; title: string; impact: string; forecast?: string; previous?: string }> = await ffRes.json()
      const highImpact = ffData.filter(
        (e) => e.date?.slice(0, 10) === todayDateStr && e.country === "USD" && e.impact === "High"
      )
      const medImpact = ffData.filter(
        (e) => e.date?.slice(0, 10) === todayDateStr && e.country === "USD" && e.impact === "Medium"
      )
      const lines: string[] = []
      for (const e of highImpact) {
        lines.push(`🔴 ${e.time} ET: ${e.title}${e.forecast ? ` — forecast: ${e.forecast}, prev: ${e.previous}` : ""}`)
      }
      for (const e of medImpact.slice(0, 4)) {
        lines.push(`🟡 ${e.time} ET: ${e.title}${e.forecast ? ` — forecast: ${e.forecast}` : ""}`)
      }
      if (lines.length) {
        economicCalendarContext = `\n\nECONOMIC CALENDAR TODAY (USD):\n${lines.join("\n")}`
      } else {
        economicCalendarContext = `\n\nECONOMIC CALENDAR TODAY: No high-impact USD events scheduled.`
      }
    }
  } catch { /* skip */ }

  const [newsResult, qqqResult, vixResult, earningsResult] = await Promise.allSettled([
    avKey
      ? fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&sort=LATEST&limit=30&apikey=${avKey}`, { signal: AbortSignal.timeout(7000) })
      : Promise.reject("no key"),
    avKey
      ? fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=QQQ&apikey=${avKey}`, { signal: AbortSignal.timeout(6000) })
      : Promise.reject("no key"),
    avKey
      ? fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=VIX&apikey=${avKey}`, { signal: AbortSignal.timeout(6000) })
      : Promise.reject("no key"),
    avKey
      ? fetch(`https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`, { signal: AbortSignal.timeout(8000) })
      : Promise.reject("no key"),
  ])

  // Parse news + extract NQ component headlines
  if (newsResult.status === "fulfilled" && newsResult.value.ok) {
    try {
      const newsData = await newsResult.value.json()
      const feed: Array<{
        title: string
        ticker_sentiment?: Array<{ ticker: string; relevance_score: string }>
      }> = newsData.feed ?? []

      const tickerMentions: Record<string, number> = {}
      const nqHeadlines: string[] = []
      const generalHeadlines: string[] = []

      for (const item of feed.slice(0, 25)) {
        const tickers = item.ticker_sentiment ?? []
        const hasNqComponent = tickers.some(
          (t) => NQ_COMPONENTS.has(t.ticker) && parseFloat(t.relevance_score) > 0.3
        )
        for (const t of tickers) {
          if (parseFloat(t.relevance_score) > 0.4) {
            tickerMentions[t.ticker] = (tickerMentions[t.ticker] ?? 0) + 1
          }
        }
        if (hasNqComponent && nqHeadlines.length < 8) {
          nqHeadlines.push(`- ${item.title}`)
        } else if (generalHeadlines.length < 8) {
          generalHeadlines.push(`- ${item.title}`)
        }
      }

      const trending = Object.entries(tickerMentions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([ticker]) => ticker)
        .join(", ")

      if (nqHeadlines.length) {
        newsContext += `\n\nNQ COMPONENT NEWS (AAPL/MSFT/NVDA/META/AMZN/GOOGL/TSLA):\n${nqHeadlines.join("\n")}`
      }
      if (generalHeadlines.length) {
        newsContext += `\n\nGENERAL MARKET NEWS:\n${generalHeadlines.join("\n")}`
      }
      if (trending) {
        newsContext += `\n\nMost mentioned tickers in the news: ${trending}`
      }
    } catch { /* skip */ }
  }

  // Parse QQQ quote (NQ proxy)
  const nqLines: string[] = []
  if (qqqResult.status === "fulfilled" && qqqResult.value.ok) {
    try {
      const d = await qqqResult.value.json()
      const q = d["Global Quote"]
      if (q?.["05. price"]) {
        const price = parseFloat(q["05. price"])
        const change = parseFloat(q["09. change"])
        const changePct = (q["10. change percent"] as string).replace("%" , "")
        const dir = change >= 0 ? "▲" : "▼"
        nqLines.push(`QQQ (Nasdaq-100 ETF / NQ proxy): $${price.toFixed(2)}  ${dir} ${Math.abs(change).toFixed(2)} (${parseFloat(changePct).toFixed(2)}%)`)
      }
    } catch { /* skip */ }
  }

  // Parse VIX
  if (vixResult.status === "fulfilled" && vixResult.value.ok) {
    try {
      const d = await vixResult.value.json()
      const q = d["Global Quote"]
      if (q?.["05. price"]) {
        const vix = parseFloat(q["05. price"])
        const vixLabel = vix < 15 ? "low — calm market" : vix < 20 ? "moderate" : vix < 30 ? "elevated — volatility up" : "high — fear/panic mode"
        nqLines.push(`VIX (fear index): ${vix.toFixed(2)} — ${vixLabel}`)
      }
    } catch { /* skip */ }
  }

  // Parse earnings calendar — show today's and tomorrow's reporting companies
  if (earningsResult.status === "fulfilled" && earningsResult.value.ok) {
    try {
      const csv = await earningsResult.value.text()
      const rows = csv.split("\n").slice(1).filter(Boolean)
      const todayEarnings: string[] = []
      const tomorrowEarnings: string[] = []
      for (const row of rows) {
        const cols = row.split(",")
        const symbol = cols[0]?.trim()
        const reportDate = cols[2]?.trim()
        if (!symbol || !reportDate) continue
        const isNq = NQ_COMPONENTS.has(symbol)
        const label = isNq ? `${symbol}*` : symbol  // star = NQ component
        if (reportDate === todayDateStr) todayEarnings.push(label)
        else if (reportDate === tomorrowDateStr) tomorrowEarnings.push(label)
      }
      if (todayEarnings.length) nqLines.push(`Earnings TODAY: ${todayEarnings.slice(0, 10).join(", ")} (* = NQ component)`)
      if (tomorrowEarnings.length) nqLines.push(`Earnings TOMORROW: ${tomorrowEarnings.slice(0, 10).join(", ")}`)
    } catch { /* skip */ }
  }

  if (nqLines.length) {
    nqContext = `\n\nNQ MARKET DATA:\n${nqLines.join("\n")}`
  }

  // Generate AI briefing
  const aiResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1400,
    system: `You are a concise personal finance assistant writing a morning market briefing email.
Today is ${today}. Be tight, actionable, and direct. Structure your response in these 7 sections:

1. WEATHER & DAY AHEAD — One line on today's weather (if provided), then 1-2 sentences previewing the day based on their tasks and calendar events.
2. NQ OUTLOOK — This is the most important section. The user day-trades NQ1 (Nasdaq-100 E-mini futures, $20/point, 10:1 leverage). Using the QQQ pre-market data and VIX provided, give: (a) concrete directional bias for today — bullish/bearish/choppy and why; (b) key price levels to watch; (c) whether VIX suggests a trending or mean-reverting session; (d) any NQ component earnings today/tomorrow and their likely index impact. Be specific — a futures trader is reading this before the open.
3. ECONOMIC CALENDAR — Based on the economic events provided: list every high-impact event today with its scheduled time. For each, explain in one sentence what a hot vs cool print means for NQ. If no events: say "No major macro events today — tape will trade on technicals and news flow." Always note: Fed decisions crush or rally NQ (rates up = NQ down), CPI/PCE hot = NQ sells off, NFP strong = mixed (good economy but Fed may stay hawkish), GDP miss = NQ drops.
4. MARKET INTEL — Based on the live news: call out 3-4 notable things to watch today. For each: one line on why it matters for NQ.
5. YOUR TASKS TODAY — List their tasks due today (if any). If none, skip this section entirely.
6. QUICK TIP — One sharp, actionable NQ trading insight relevant to today's specific conditions (VIX level, economic events, trend).

Use plain text, no markdown. Separate sections with a blank line and label in ALL CAPS.
Start with a one-line greeting. Sign off as "JDpro AI — Your Morning Briefing".`,
    messages: [{
      role: "user",
      content: `My portfolio:\n${portfolioContext}${weatherContext}${nqContext}${economicCalendarContext}${tasksContext}${eventsContext}${newsContext}\n\nWrite my morning briefing for ${today}.`,
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
        <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Good Morning, Jonathan ☀️</h1>
        <p style="color:#c7d2fe;font-size:13px;margin:8px 0 0;">${today}</p>
      </div>

      <!-- AI Briefing -->
      <div style="padding:24px;">
        <div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${aiText}</p>
        </div>

        <!-- NQ Futures Cheat Sheet -->
        <h2 style="font-size:15px;font-weight:600;margin:0 0 12px;color:#111827;">⚡ NQ Futures Quick Reference</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#1e1b4b;">
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">Contract</th>
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">1 Point</th>
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">1 Tick (0.25pt)</th>
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">Margin ~</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb;">
              <td style="padding:8px 12px;font-weight:700;">NQ (E-mini)</td>
              <td style="padding:8px 12px;color:#16a34a;font-weight:600;">$20</td>
              <td style="padding:8px 12px;">$5</td>
              <td style="padding:8px 12px;">~$59k</td>
            </tr>
            <tr style="background:#fff;border-bottom:1px solid #e5e7eb;">
              <td style="padding:8px 12px;font-weight:700;">MNQ (Micro)</td>
              <td style="padding:8px 12px;color:#16a34a;font-weight:600;">$2</td>
              <td style="padding:8px 12px;">$0.50</td>
              <td style="padding:8px 12px;">~$5.9k</td>
            </tr>
          </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#1e1b4b;">
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">News Type</th>
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">Hot / Strong Print</th>
              <th style="padding:8px 12px;text-align:left;color:#c7d2fe;font-weight:600;">Cool / Weak Print</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb;">
              <td style="padding:7px 12px;font-weight:600;">Fed Rate Decision</td>
              <td style="padding:7px 12px;color:#dc2626;">Hike → NQ drops</td>
              <td style="padding:7px 12px;color:#16a34a;">Cut → NQ rips</td>
            </tr>
            <tr style="background:#fff;border-bottom:1px solid #e5e7eb;">
              <td style="padding:7px 12px;font-weight:600;">CPI / PCE Inflation</td>
              <td style="padding:7px 12px;color:#dc2626;">High inflation → NQ sells</td>
              <td style="padding:7px 12px;color:#16a34a;">Cool → NQ pumps</td>
            </tr>
            <tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb;">
              <td style="padding:7px 12px;font-weight:600;">NFP Jobs (1st Fri)</td>
              <td style="padding:7px 12px;color:#f59e0b;">Strong → mixed (Fed hawkish)</td>
              <td style="padding:7px 12px;color:#dc2626;">Weak → recession fear</td>
            </tr>
            <tr style="background:#fff;border-bottom:1px solid #e5e7eb;">
              <td style="padding:7px 12px;font-weight:600;">GDP</td>
              <td style="padding:7px 12px;color:#16a34a;">Beat → NQ up</td>
              <td style="padding:7px 12px;color:#dc2626;">Miss → NQ drops</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:7px 12px;font-weight:600;">Big Tech Earnings</td>
              <td style="padding:7px 12px;color:#16a34a;">Beat → 100-300pt spike</td>
              <td style="padding:7px 12px;color:#dc2626;">Miss → 100-300pt drop</td>
            </tr>
          </tbody>
        </table>

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
