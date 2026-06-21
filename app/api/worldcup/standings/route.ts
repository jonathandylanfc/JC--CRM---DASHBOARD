import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 0

export async function GET() {
  try {
    const res = await fetch(`${ESPN_BASE}/standings`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    })
    if (!res.ok) return NextResponse.json({ groups: [] })
    const json = await res.json()

    // ESPN returns standings grouped under children (one per group)
    const children: unknown[] = json?.children ?? json?.standings?.children ?? []

    const groups = children.map((child: unknown) => {
      const c = child as {
        name: string
        abbreviation?: string
        standings: {
          entries: Array<{
            team: { id: string; abbreviation: string; displayName: string; shortDisplayName: string; logo?: string }
            stats: Array<{ name: string; value: number; displayValue: string }>
          }>
        }
      }

      const stat = (entry: typeof c.standings.entries[0], name: string) =>
        entry.stats.find((s) => s.name === name)?.value ?? 0

      const entries = (c.standings?.entries ?? []).map((entry) => ({
        team: {
          name: entry.team.displayName,
          short: entry.team.shortDisplayName,
          abbr: entry.team.abbreviation,
          logo: entry.team.logo ?? null,
        },
        gp: stat(entry, "gamesPlayed"),
        w: stat(entry, "wins"),
        d: stat(entry, "ties"),
        l: stat(entry, "losses"),
        gf: stat(entry, "pointsFor"),
        ga: stat(entry, "pointsAgainst"),
        gd: stat(entry, "pointDifferential"),
        pts: stat(entry, "points"),
      }))

      entries.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)

      return {
        name: c.name,
        abbr: c.abbreviation ?? c.name,
        entries,
      }
    })

    return NextResponse.json({ groups })
  } catch (e) {
    console.error("World Cup standings error:", e)
    return NextResponse.json({ groups: [] })
  }
}
