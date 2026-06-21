import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 0

export async function GET() {
  try {
    // Fetch today's scoreboard + a window around it
    const today = new Date()
    const dates: string[] = []
    for (let i = -7; i <= 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""))
    }

    // ESPN scoreboard returns today by default; fetch multiple days in parallel
    const responses = await Promise.allSettled(
      dates.map((date) =>
        fetch(`${ESPN_BASE}/scoreboard?dates=${date}&limit=20`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
        }).then((r) => r.json())
      )
    )

    const allEvents: unknown[] = []
    for (const res of responses) {
      if (res.status === "fulfilled" && res.value?.events) {
        allEvents.push(...res.value.events)
      }
    }

    // Deduplicate by event id
    const seen = new Set<string>()
    const events = allEvents.filter((e: unknown) => {
      const ev = e as { id: string }
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })

    const matches = events.map((event: unknown) => {
      const e = event as {
        id: string
        date: string
        name: string
        competitions: Array<{
          status: {
            clock?: number
            displayClock?: string
            period?: number
            type: { state: string; detail: string; shortDetail: string; completed: boolean }
          }
          competitors: Array<{
            homeAway: string
            score: string
            team: {
              abbreviation: string
              displayName: string
              shortDisplayName: string
              logo?: string
              flag?: string
            }
          }>
          venue?: { fullName: string; address?: { city: string; country: string } }
          notes?: Array<{ type: string; headline: string }>
          altGameNote?: string
        }>
      }

      const comp = e.competitions[0]
      const home = comp.competitors.find((c) => c.homeAway === "home") ?? comp.competitors[0]
      const away = comp.competitors.find((c) => c.homeAway === "away") ?? comp.competitors[1]
      const status = comp.status

      return {
        id: e.id,
        date: e.date,
        homeTeam: {
          name: home.team.displayName,
          abbr: home.team.abbreviation,
          logo: home.team.logo ?? null,
          score: home.score ?? null,
        },
        awayTeam: {
          name: away.team.displayName,
          abbr: away.team.abbreviation,
          logo: away.team.logo ?? null,
          score: away.score ?? null,
        },
        status: {
          state: status.type.state, // "pre" | "in" | "post"
          detail: status.type.detail,
          shortDetail: status.type.shortDetail,
          completed: status.type.completed,
          clock: status.displayClock ?? null,
          period: status.period ?? null,
        },
        venue: comp.venue?.fullName ?? null,
        group: comp.altGameNote ?? comp.notes?.find((n) => n.type === "event")?.headline ?? null,
      }
    })

    // Sort: in-progress first, then by date
    matches.sort((a, b) => {
      const order = { in: 0, pre: 1, post: 2 }
      const ao = order[a.status.state as keyof typeof order] ?? 3
      const bo = order[b.status.state as keyof typeof order] ?? 3
      if (ao !== bo) return ao - bo
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

    return NextResponse.json({ matches })
  } catch (e) {
    console.error("World Cup scores error:", e)
    return NextResponse.json({ matches: [] })
  }
}
