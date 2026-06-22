import { NextResponse } from "next/server"

export const revalidate = 60

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world"

interface TeamStats {
  name: string; short: string; abbr: string; logo: string | null
  gp: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number
}

// Transform flat TeamStats into the nested shape the frontend StandingEntry interface expects
function toEntry(t: TeamStats) {
  return {
    team: { name: t.name, short: t.short, abbr: t.abbr, logo: t.logo },
    gp: t.gp, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, gd: t.gd, pts: t.pts,
  }
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

  type RawEntry = {
    team: { displayName: string; shortDisplayName?: string; abbreviation: string; logos?: Array<{ href: string }> }
    stats: Array<{ name: string; value: number }>
    group?: { displayName: string }
  }
  type RawChild = {
    name?: string
    standings?: { entries: RawEntry[] }
    entries?: RawEntry[]
    children?: RawChild[]
  }

  const groupMap = new Map<string, TeamStats[]>()

  // Recursively walk children to find groups that have entries
  function walkChildren(children: RawChild[]) {
    for (const child of children) {
      const rawEntries: RawEntry[] = child.standings?.entries ?? child.entries ?? []
      if (rawEntries.length > 0 && child.name) {
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
        groupMap.set(child.name, parsed)
      }
      if (child.children?.length) walkChildren(child.children)
    }
  }

  if (Array.isArray(data?.children)) {
    walkChildren(data.children as RawChild[])
  }

  if (groupMap.size > 0) {
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ents]) => ({
        name,
        abbr: name.replace(/^Group\s+/i, ""),
        entries: sortEntries(ents).map(toEntry),
      }))
  }

  // Flat entries with group field
  const flatEntries: RawEntry[] = data?.standings?.entries ?? []
  if (flatEntries.length > 0) {
    const flatMap = new Map<string, TeamStats[]>()
    for (const e of flatEntries) {
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
      if (!flatMap.has(groupName)) flatMap.set(groupName, [])
      flatMap.get(groupName)!.push(team)
    }
    if (flatMap.size > 0) {
      return Array.from(flatMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, ents]) => ({
          name,
          abbr: name.replace(/^Group\s+/i, ""),
          entries: sortEntries(ents).map(toEntry),
        }))
    }
  }

  throw new Error("No standings data in response")
}

// ── Strategy 2: compute from scoreboard ───────────────────────────────────────
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
      entries: sortEntries(Array.from(teams.values())).map(toEntry),
    }))
}

export async function GET() {
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
