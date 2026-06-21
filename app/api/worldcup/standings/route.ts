import { NextResponse } from "next/server"

export const revalidate = 60 // revalidate every minute during group stage

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

interface TeamStats {
  name: string
  short: string
  abbr: string
  logo: string | null
  gp: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
}

export async function GET() {
  try {
    // Group stage: June 11 – June 26, 2026
    const dates: string[] = []
    for (let day = 11; day <= 26; day++) {
      dates.push(`202606${String(day).padStart(2, "0")}`)
    }

    const responses = await Promise.allSettled(
      dates.map((date) =>
        fetch(`${ESPN_BASE}/scoreboard?dates=${date}&limit=20`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
        }).then((r) => r.json())
      )
    )

    // Map: groupLetter -> teamAbbr -> stats
    const groupMap = new Map<string, Map<string, TeamStats>>()

    for (const res of responses) {
      if (res.status !== "fulfilled" || !res.value?.events) continue

      for (const event of res.value.events) {
        const comp = event.competitions?.[0]
        if (!comp) continue

        // Parse group from altGameNote: "FIFA World Cup, Group A"
        const note: string = comp.altGameNote ?? ""
        const groupMatch = note.match(/Group\s+([A-L])/i)
        if (!groupMatch) continue
        const groupLetter = groupMatch[1].toUpperCase()

        const state: string = comp.status?.type?.state ?? "pre"
        const completed: boolean = comp.status?.type?.completed ?? false

        // Only count completed matches for stats
        if (!completed || state !== "post") continue

        const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home")
        const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away")
        if (!home || !away) continue

        const hs = parseInt(home.score ?? "0", 10) || 0
        const as_ = parseInt(away.score ?? "0", 10) || 0

        if (!groupMap.has(groupLetter)) groupMap.set(groupLetter, new Map())
        const group = groupMap.get(groupLetter)!

        const ensureTeam = (c: { team: { displayName: string; shortDisplayName: string; abbreviation: string; logo?: string } }) => {
          const abbr = c.team.abbreviation
          if (!group.has(abbr)) {
            group.set(abbr, {
              name: c.team.displayName,
              short: c.team.shortDisplayName ?? c.team.abbreviation,
              abbr,
              logo: c.team.logo ?? null,
              gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
            })
          }
          return group.get(abbr)!
        }

        const homeStats = ensureTeam(home)
        const awayStats = ensureTeam(away)

        homeStats.gp++; awayStats.gp++
        homeStats.gf += hs; homeStats.ga += as_; homeStats.gd = homeStats.gf - homeStats.ga
        awayStats.gf += as_; awayStats.ga += hs; awayStats.gd = awayStats.gf - awayStats.ga

        if (hs > as_) {
          homeStats.w++; homeStats.pts += 3
          awayStats.l++
        } else if (hs < as_) {
          awayStats.w++; awayStats.pts += 3
          homeStats.l++
        } else {
          homeStats.d++; homeStats.pts++
          awayStats.d++; awayStats.pts++
        }
      }
    }

    // Sort groups alphabetically and entries by Pts, GD, GF
    const groups = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, teams]) => {
        const entries = Array.from(teams.values()).sort(
          (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)
        )
        return { name: `Group ${letter}`, abbr: letter, entries }
      })

    return NextResponse.json({ groups })
  } catch (e) {
    console.error("World Cup standings error:", e)
    return NextResponse.json({ groups: [] })
  }
}
