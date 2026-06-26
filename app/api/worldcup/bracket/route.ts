import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 0

export interface BracketMatch {
  id: string
  date: string
  round: string
  roundOrder: number
  home: { name: string; shortName: string; logo: string | null; score: number | null }
  away: { name: string; shortName: string; logo: string | null; score: number | null }
  venue: string
  status: "scheduled" | "in_progress" | "final"
  winner: "home" | "away" | null
}

const KNOCKOUT_DATES = [
  "20260629", "20260630", "20260701", "20260702", "20260703",
  "20260704", "20260705", "20260706", "20260707",
  "20260710", "20260712", "20260714", "20260719",
]

const ROUND_ORDER: Record<string, number> = {
  "round of 32": 1,
  "round of 16": 2,
  "quarterfinal": 3,
  "quarterfinals": 3,
  "semifinal": 4,
  "semifinals": 4,
  "third place": 5,
  "third-place": 5,
  "final": 6,
}

function parseRound(note: string): { label: string; order: number } {
  const lower = note.toLowerCase()
  for (const [key, order] of Object.entries(ROUND_ORDER)) {
    if (lower.includes(key)) {
      const label = key === "round of 32" ? "Round of 32"
        : key === "round of 16" ? "Round of 16"
        : key.includes("quarter") ? "Quarterfinals"
        : key.includes("semi") ? "Semifinals"
        : key.includes("third") ? "Third Place"
        : "Final"
      return { label, order }
    }
  }
  return { label: note, order: 99 }
}

export async function GET() {
  const results = await Promise.allSettled(
    KNOCKOUT_DATES.map((date) =>
      fetch(`${ESPN_BASE}/scoreboard?dates=${date}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }).then((r) => r.json())
    )
  )

  const seen = new Set<string>()
  const matches: BracketMatch[] = []

  for (const result of results) {
    if (result.status !== "fulfilled") continue
    const events: unknown[] = result.value?.events ?? []

    for (const event of events) {
      const e = event as Record<string, unknown>
      const id = String(e.id ?? "")
      if (!id || seen.has(id)) continue
      seen.add(id)

      const comp = (e.competitions as Record<string, unknown>[])?.[0]
      if (!comp) continue

      const note = String(comp.altGameNote ?? "")
      if (!note.toLowerCase().includes("round") && !note.toLowerCase().includes("final") && !note.toLowerCase().includes("quarter") && !note.toLowerCase().includes("semi")) continue

      const { label: round, order: roundOrder } = parseRound(note)

      const competitors = (comp.competitors as Record<string, unknown>[]) ?? []
      const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0]
      const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1]

      if (!home || !away) continue

      const parseTeam = (c: Record<string, unknown>) => {
        const team = c.team as Record<string, unknown> ?? {}
        const logos = team.logos as Array<{ href: string }> ?? []
        return {
          name: String(team.displayName ?? "TBD"),
          shortName: String(team.abbreviation ?? team.shortDisplayName ?? "TBD"),
          logo: logos[0]?.href ?? null,
          score: c.score != null ? Number(c.score) : null,
        }
      }

      const statusObj = e.status as Record<string, unknown> ?? {}
      const statusType = statusObj.type as Record<string, unknown> ?? {}
      const statusName = String(statusType.name ?? "")
      const status: BracketMatch["status"] =
        statusName === "STATUS_FINAL" ? "final"
        : statusName === "STATUS_IN_PROGRESS" ? "in_progress"
        : "scheduled"

      const homeTeam = parseTeam(home)
      const awayTeam = parseTeam(away)
      const winner: BracketMatch["winner"] =
        status === "final"
          ? (homeTeam.score ?? 0) > (awayTeam.score ?? 0) ? "home" : "away"
          : null

      const venue = (comp.venue as Record<string, unknown> | undefined)?.fullName as string | undefined

      matches.push({
        id,
        date: String(comp.date ?? e.date ?? ""),
        round,
        roundOrder,
        home: homeTeam,
        away: awayTeam,
        venue: venue ?? "",
        status,
        winner,
      })
    }
  }

  matches.sort((a, b) => a.roundOrder - b.roundOrder || a.date.localeCompare(b.date))

  return NextResponse.json({ matches })
}
