import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 60

interface BracketTeam {
  id: string
  name: string
  abbr: string
  logo: string | null
  score: string | null
  winner: boolean
  seed: string | null
}

interface BracketMatch {
  id: string
  round: number
  roundName: string
  matchNum: number
  homeTeam: BracketTeam
  awayTeam: BracketTeam
  state: "pre" | "in" | "post"
  date: string
  tbd: boolean
}

function parseTeam(comp: {
  homeAway?: string
  team?: { id?: string; displayName?: string; abbreviation?: string; logos?: Array<{ href?: string }>; logo?: string }
  score?: string | number
  winner?: boolean
  curRecord?: string
  seed?: { rank?: number | string }
} | undefined, tbd: boolean): BracketTeam {
  if (!comp || tbd) {
    return { id: "", name: "TBD", abbr: "TBD", logo: null, score: null, winner: false, seed: null }
  }
  const team = comp.team ?? {}
  const logo = team.logos?.[0]?.href ?? team.logo ?? null
  return {
    id: team.id ?? "",
    name: team.displayName ?? team.abbreviation ?? "TBD",
    abbr: team.abbreviation ?? team.displayName?.slice(0, 3).toUpperCase() ?? "TBD",
    logo,
    score: comp.score != null ? String(comp.score) : null,
    winner: comp.winner ?? false,
    seed: comp.seed?.rank != null ? String(comp.seed.rank) : null,
  }
}

const ROUND_NAMES: Record<number, string> = {
  32: "Round of 32",
  16: "Round of 16",
  8: "Quarterfinals",
  4: "Semifinals",
  2: "Final",
  1: "Champion",
}

function roundName(r: number): string {
  return ROUND_NAMES[r] ?? `Round of ${r}`
}

export async function GET() {
  try {
    // ESPN uses "groups" or "bracket" type parameters; try the bracket endpoint
    const urls = [
      `${ESPN_BASE}/scoreboard?limit=200&groups=9`,  // knockout group
      `${ESPN_BASE}/scoreboard?limit=200&round=3`,
      `${ESPN_BASE}/scoreboard?limit=200`,
    ]

    let events: RawEvent[] = []

    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
        })
        if (!r.ok) continue
        const data = await r.json()
        const ev: RawEvent[] = data.events ?? []
        // Filter for knockout stage events (no group label, or round >= R32)
        const knockout = ev.filter((e: RawEvent) => {
          const season = e.season?.type ?? 0
          const groups = e.competitions?.[0]?.groups?.id
          // In ESPN WC data, knockout matches have season.type=3 or a "bracket" type
          return season === 3 || (groups && parseInt(String(groups)) > 100)
        })
        if (knockout.length > 0) { events = knockout; break }
        // Fallback: if no knockout detected, use all events and filter by date
        if (ev.length > 0 && events.length === 0) events = ev
      } catch { continue }
    }

    if (!events.length) {
      return NextResponse.json({ matches: [], available: false })
    }

    const matches: BracketMatch[] = []

    for (const ev of events) {
      const comp = ev.competitions?.[0]
      if (!comp) continue

      const competitors = comp.competitors ?? []
      const home = competitors.find((c: RawComp) => c.homeAway === "home")
      const away = competitors.find((c: RawComp) => c.homeAway === "away")

      const isTbd = !home?.team?.displayName || home.team.displayName === "TBD"
      const statusState = ev.status?.type?.state ?? "pre"
      const state: "pre" | "in" | "post" = statusState === "in" ? "in" : statusState === "post" ? "post" : "pre"

      // Derive round from ESPN round data or notes
      const roundNum = comp.notes?.[0]?.round ?? ev.season?.type === 3 ? detectRound(ev) : 0

      matches.push({
        id: ev.id,
        round: roundNum,
        roundName: roundName(roundNum),
        matchNum: parseInt(ev.uid?.split("~e:")[1] ?? "0") || matches.length + 1,
        homeTeam: parseTeam(home, isTbd),
        awayTeam: parseTeam(away, isTbd),
        state,
        date: ev.date ?? "",
        tbd: isTbd,
      })
    }

    matches.sort((a, b) => {
      if (a.round !== b.round) return b.round - a.round
      return a.matchNum - b.matchNum
    })

    return NextResponse.json({ matches, available: matches.length > 0 })
  } catch (e) {
    console.error("Bracket error:", e)
    return NextResponse.json({ matches: [], available: false })
  }
}

interface RawComp {
  homeAway?: string
  team?: { id?: string; displayName?: string; abbreviation?: string; logos?: Array<{ href?: string }>; logo?: string }
  score?: string | number
  winner?: boolean
  seed?: { rank?: number | string }
}

interface RawEvent {
  id: string
  uid?: string
  date?: string
  season?: { type?: number }
  status?: { type?: { state?: string } }
  competitions?: Array<{
    competitors?: RawComp[]
    groups?: { id?: string | number }
    notes?: Array<{ round?: number }>
  }>
}

function detectRound(ev: RawEvent): number {
  // Try to detect round from the event name or other clues
  const name = (ev as unknown as { name?: string }).name ?? ""
  if (name.includes("Final") && !name.includes("Semi") && !name.includes("Quarter")) return 2
  if (name.includes("Semi")) return 4
  if (name.includes("Quarter")) return 8
  if (name.includes("16")) return 16
  if (name.includes("32")) return 32
  return 32
}
