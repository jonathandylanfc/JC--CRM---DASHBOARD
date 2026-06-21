import { NextResponse } from "next/server"

export const revalidate = 60

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world"

interface TeamStats {
  name: string; short: string; abbr: string; logo: string | null
  gp: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number
}

function statVal(stats: Array<{ name: string; value: number }>, name: string): number {
  return stats.find((s) => s.name === name)?.value ?? 0
}

function sortEntries(entries: TeamStats[]) {
  return entries.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name))
}

// ── Strategy 1: ESPN v2 standings endpoint ─────────────────────────────────────
async function fetchFromStandingsAPI() {
  const r = await fetch(`${ESPN_V2}/standings`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()

  // ESPN returns groups as `children` or flat `entries` with a `group` field
  type RawEntry = {
    team: { displayName: string; shortDisplayName?: string; abbreviation: string; logos?: Array<{ href: string }> }
    stats: Array<{ name: string; value: number }>
    group?: { displayName: string }
  }
  type RawChild = { name?: string; standings?: { entries: RawEntry[] }; entries?: RawEntry[] }

  let entries: RawEntry[] = []

  if (Array.isArray(data?.children)) {
    // Group-per-child shape
    const groupMap = new Map<string, TeamStats[]>()
    for (const child of data.children as RawChild[]) {
      const groupName: string = child.name ?? "Unknown"
      const rawEntries: RawEntry[] = child.standings?.entries ?? child.entries ?? []
      if (!rawEntries.length) continue
      const parsed: TeamStats[] = rawEntries.map((e) => ({
        name: e.team.displayName,
        short: e.team.shortDisplayName ?? e.team.abbreviation,
        abbr: e.team.abbreviation,
        logo: e.team.logos?.[0]?.href ?? null,
        gp: statVal(e.stats, "gamesPlayed"),
        w:  statVal(e.stats, "wins"),
        d:  statVal(e.stats, "ties"),
        l:  statVal(e.stats, "losses"),
        gf: statVal(e.stats, "pointsFor"),
        ga: statVal(e.stats, "pointsAgainst"),
        gd: statVal(e.stats, "pointDifferential"),
        pts: statVal(e.stats, "points"),
      }))
      groupMap.set(groupName, parsed)
    }
    if (groupMap.size > 0) {
      return Array.from(groupMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, ents]) => ({ name, abbr: name.replace(/^Group\s+/i, ""), entries: sortEntries(ents) }))
    }
  }

  // Flat entries with group field
  entries = data?.standings?.entries ?? []
  if (entries.length > 0) {
    const groupMap = new Map<string, TeamStats[]>()
    for (const e of entries) {
      const groupName = e.group?.displayName ?? "Unknown"
      const team: TeamStats = {
        name: e.team.displayName,
        short: e.team.shortDisplayName ?? e.team.abbreviation,
        abbr: e.team.abbreviation,
        logo: e.team.logos?.[0]?.href ?? null,
        gp: statVal(e.stats, "gamesPlayed"),
        w:  statVal(e.stats, "wins"),
        d:  statVal(e.stats, "ties"),
        l:  statVal(e.stats, "losses"),
        gf: statVal(e.stats, "pointsFor"),
        ga: statVal(e.stats, "pointsAgainst"),
        gd: statVal(e.stats, "pointDifferential"),
        pts: statVal(e.stats, "points"),
      }
      if (!groupMap.has(groupName)) groupMap.set(groupName, [])
      groupMap.get(groupName)!.push(team)
    }
    if (groupMap.size > 0) {
      return Array.from(groupMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, ents]) => ({ name, abbr: name.replace(/^Group\s+/i, ""), entries: sortEntries(ents) }))
    }
  }

  throw new Error("No standings data in response")
}

// ── Strategy 2: compute from scoreboard (fixed to check notes field too) ───────
async function fetchFromScoreboard() {
  const dates: string[] = []
  for (let day = 11; day <= 26; day++) {
    dates.push(`202606${String(day).padStart(2, "0")}`)
  }

  const responses = await Promise.allSettled(
    dates.map((date) =>
      fetch(`${ESPN_SITE}/scoreboard?dates=${date}&limit=20`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }).then((r) => r.json())
    )
  )

  const groupMap = new Map<string, Map<string, TeamStats>>()

  for (const res of responses) {
    if (res.status !== "fulfilled" || !res.value?.events) continue

    for (const event of res.value.events) {
      const comp = event.competitions?.[0]
      if (!comp) continue

      // Use same field logic as scores route
      const note: string =
        comp.altGameNote ??
        comp.notes?.find((n: { type: string }) => n.type === "event")?.headline ??
        ""

      const groupMatch = note.match(/Group\s+([A-L])/i)
      if (!groupMatch) continue
      const groupLetter = groupMatch[1].toUpperCase()

      if (!comp.status?.type?.completed || comp.status?.type?.state !== "post") continue

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

      const hStats = ensureTeam(home)
      const aStats = ensureTeam(away)

      hStats.gp++; aStats.gp++
      hStats.gf += hs; hStats.ga += as_; hStats.gd = hStats.gf - hStats.ga
      aStats.gf += as_; aStats.ga += hs; aStats.gd = aStats.gf - aStats.ga

      if (hs > as_) {
        hStats.w++; hStats.pts += 3; aStats.l++
      } else if (hs < as_) {
        aStats.w++; aStats.pts += 3; hStats.l++
      } else {
        hStats.d++; hStats.pts++; aStats.d++; aStats.pts++
      }
    }
  }

  if (groupMap.size === 0) throw new Error("No group data from scoreboard")

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, teams]) => ({
      name: `Group ${letter}`,
      abbr: letter,
      entries: sortEntries(Array.from(teams.values())),
    }))
}

export async function GET() {
  // Try dedicated standings API first, fall back to score computation
  try {
    const groups = await fetchFromStandingsAPI()
    if (groups.length > 0) return NextResponse.json({ groups })
  } catch (e) {
    console.warn("Standings API failed, falling back to scoreboard computation:", e)
  }

  try {
    const groups = await fetchFromScoreboard()
    return NextResponse.json({ groups })
  } catch (e) {
    console.error("World Cup standings error:", e)
    return NextResponse.json({ groups: [] })
  }
}
