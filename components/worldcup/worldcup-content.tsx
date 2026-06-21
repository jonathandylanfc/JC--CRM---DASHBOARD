"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, CalendarPlus } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Team { name: string; abbr: string; logo: string | null; score: string | null }
interface MatchStatus { state: "pre" | "in" | "post"; detail: string; shortDetail: string; completed: boolean; clock: string | null; period: number | null }
interface Match { id: string; date: string; homeTeam: Team; awayTeam: Team; status: MatchStatus; venue: string | null; group: string | null }

interface StandingEntry {
  team: { name: string; short: string; abbr: string; logo: string | null }
  gp: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number
}
interface Group { name: string; abbr: string; entries: StandingEntry[] }

interface Ranking { rank: number; prevRank: number; name: string; short: string; flag: string | null; confederation: string; points: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

function TeamLogo({ logo, name, size = 24 }: { logo: string | null; name: string | null | undefined; size?: number }) {
  const [err, setErr] = useState(false)
  const initials = (name ?? "?").slice(0, 3).toUpperCase()
  if (!logo || err) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >
        {initials}
      </div>
    )
  }
  return (
    <img
      src={logo}
      alt={name ?? ""}
      width={size}
      height={size}
      className="object-contain shrink-0"
      onError={() => setErr(true)}
    />
  )
}

function kickoffTime(isoDate: string) {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function StatusBadge({ status, date }: { status: MatchStatus; date: string }) {
  if (status.state === "in") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {status.clock ?? "LIVE"}
      </span>
    )
  }
  if (status.state === "post") {
    return <span className="text-[10px] text-muted-foreground font-medium">FT</span>
  }
  const t = kickoffTime(date)
  return <span className="text-[10px] font-semibold text-muted-foreground">{t}</span>
}

function MatchCard({ match }: { match: Match }) {
  const isLive = match.status.state === "in"
  const isDone = match.status.state === "post"
  const homeScore = parseInt(match.homeTeam.score ?? "", 10)
  const awayScore = parseInt(match.awayTeam.score ?? "", 10)
  const homeWin = isDone && !isNaN(homeScore) && !isNaN(awayScore) && homeScore > awayScore
  const awayWin = isDone && !isNaN(homeScore) && !isNaN(awayScore) && awayScore > homeScore

  return (
    <div className={`rounded-xl border p-3 transition-all backdrop-blur-sm ${isLive ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card/60"}`}>
      {match.group && (
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{match.group}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TeamLogo logo={match.homeTeam.logo} name={match.homeTeam.abbr} size={28} />
          <span className={`text-sm font-semibold truncate ${homeWin ? "text-foreground" : isDone ? "text-muted-foreground" : "text-foreground"}`}>
            {match.homeTeam.abbr}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-2 shrink-0">
          {(isLive || isDone) && match.homeTeam.score !== null ? (
            <div className="flex items-center gap-1.5">
              <span className={`text-lg font-bold tabular-nums ${homeWin ? "text-foreground" : "text-muted-foreground"}`}>
                {match.homeTeam.score}
              </span>
              <span className="text-muted-foreground text-sm">–</span>
              <span className={`text-lg font-bold tabular-nums ${awayWin ? "text-foreground" : "text-muted-foreground"}`}>
                {match.awayTeam.score}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm font-medium">vs</span>
          )}
          <StatusBadge status={match.status} date={match.date} />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-sm font-semibold truncate text-right ${awayWin ? "text-foreground" : isDone ? "text-muted-foreground" : "text-foreground"}`}>
            {match.awayTeam.abbr}
          </span>
          <TeamLogo logo={match.awayTeam.logo} name={match.awayTeam.abbr} size={28} />
        </div>
      </div>
      {match.venue && (
        <p className="text-[9px] text-muted-foreground mt-1.5 text-center truncate">{match.venue}</p>
      )}
    </div>
  )
}

// ── Scores Tab ─────────────────────────────────────────────────────────────────

function localDateKey(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-CA") // YYYY-MM-DD in local time
}

function todayLocalKey() {
  return new Date().toLocaleDateString("en-CA")
}

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00")
  const now = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)

  if (isSameDay(d, now)) return "Today"
  if (isSameDay(d, yesterday)) return "Yesterday"
  if (isSameDay(d, tomorrow)) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function DateSection({ date, matches, isToday }: { date: string; matches: Match[]; isToday: boolean }) {
  const label = formatDayHeader(date)
  const hasLive = matches.some((m) => m.status.state === "in")
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 sticky top-12 bg-background/40 backdrop-blur-md py-1.5 z-10">
        <h3 className={`text-sm font-bold ${isToday ? "text-foreground" : "text-muted-foreground"}`}>{label}</h3>
        {hasLive && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        )}
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-2">
        {matches.map((m) => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  )
}

function ScoresTab() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const mostRecentPastRef = useRef<HTMLDivElement>(null)

  const fetchScores = useCallback(async () => {
    try {
      const r = await fetch("/api/worldcup/scores", { cache: "no-store" })
      const d = await r.json()
      setMatches(d.matches ?? [])
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchScores()
    const iv = setInterval(fetchScores, 60_000)
    return () => clearInterval(iv)
  }, [fetchScores])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!matches.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No matches found</p>
      </div>
    )
  }

  const today = todayLocalKey()
  const byDate = new Map<string, Match[]>()
  for (const m of [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const key = localDateKey(m.date)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(m)
  }
  const sortedDates = Array.from(byDate.keys()).sort()
  const pastDates = sortedDates.filter((d) => d < today)
  const currentAndFutureDates = sortedDates.filter((d) => d >= today)
  const totalPastMatches = pastDates.reduce((n, d) => n + byDate.get(d)!.length, 0)

  const handleShowHistory = () => {
    setShowHistory(true)
    // Scroll to the most recent past game (last in pastDates) after render
    setTimeout(() => {
      mostRecentPastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  return (
    <div className="space-y-6">
      {/* Floating pill to hide history while scrolling */}
      {showHistory && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={() => setShowHistory(false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            Hide game history
          </button>
        </div>
      )}

      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-right">
          Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
      )}

      {/* History toggle button */}
      {pastDates.length > 0 && !showHistory && (
        <button
          onClick={handleShowHistory}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-lg transition-colors bg-card/30 backdrop-blur-sm"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Load game history ({totalPastMatches} matches)
        </button>
      )}

      {/* Past matches — most recent last so it appears closest to Today */}
      {showHistory && pastDates.map((date, i) => (
        <div key={date} ref={i === pastDates.length - 1 ? mostRecentPastRef : undefined}>
          <DateSection date={date} matches={byDate.get(date)!} isToday={false} />
        </div>
      ))}

      {/* Today and upcoming */}
      {currentAndFutureDates.map((date) => (
        <DateSection key={date} date={date} matches={byDate.get(date)!} isToday={date === today} />
      ))}
    </div>
  )
}

// ── Standings Tab ──────────────────────────────────────────────────────────────

function StandingsTab() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch("/api/worldcup/standings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        const grps = d.groups
        if (Array.isArray(grps)) setGroups(grps)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !groups.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Group standings not yet available</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {groups.map((group) => (
        <div key={group.name} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-bold uppercase tracking-wider">{group.name}</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-3 py-1.5 text-muted-foreground font-medium w-6">#</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Team</th>
                <th className="text-center px-1 py-1.5 text-muted-foreground font-medium">GP</th>
                <th className="text-center px-1 py-1.5 text-muted-foreground font-medium">W</th>
                <th className="text-center px-1 py-1.5 text-muted-foreground font-medium">D</th>
                <th className="text-center px-1 py-1.5 text-muted-foreground font-medium">L</th>
                <th className="text-center px-1 py-1.5 text-muted-foreground font-medium">GD</th>
                <th className="text-center px-2 py-1.5 text-muted-foreground font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {(group.entries ?? []).map((entry, idx) => {
                if (!entry?.team) return null
                const isQ = idx < 2
                const gd = entry.gd ?? 0
                return (
                  <tr
                    key={entry.team.abbr ?? idx}
                    className={`border-b border-border/30 last:border-0 ${isQ ? "bg-emerald-500/5" : ""}`}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo logo={entry.team.logo} name={entry.team.abbr} size={16} />
                        <span className="font-medium truncate max-w-[80px]">{entry.team.short ?? entry.team.abbr}</span>
                      </div>
                    </td>
                    <td className="text-center px-1 py-1.5 text-muted-foreground">{entry.gp ?? 0}</td>
                    <td className="text-center px-1 py-1.5">{entry.w ?? 0}</td>
                    <td className="text-center px-1 py-1.5">{entry.d ?? 0}</td>
                    <td className="text-center px-1 py-1.5">{entry.l ?? 0}</td>
                    <td className="text-center px-1 py-1.5 text-muted-foreground">
                      {gd > 0 ? `+${gd}` : gd}
                    </td>
                    <td className="text-center px-2 py-1.5 font-bold">{entry.pts ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Rankings Tab ───────────────────────────────────────────────────────────────

const CONF_COLORS: Record<string, string> = {
  UEFA: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  CONMEBOL: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  CAF: "bg-green-500/10 text-green-600 dark:text-green-400",
  AFC: "bg-red-500/10 text-red-600 dark:text-red-400",
  CONCACAF: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  OFC: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
}

function RankingsTab() {
  const [rankings, setRankings] = useState<Ranking[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState("")

  useEffect(() => {
    fetch("/api/worldcup/rankings")
      .then((r) => r.json())
      .then((d) => { setRankings(d.rankings ?? []); setSource(d.source ?? "") })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!rankings.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium mb-1">Rankings unavailable</p>
        <p className="text-xs">FIFA rankings data couldn't be loaded right now</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">FIFA Coca-Cola World Rankings</p>
        {source === "static" && <span className="text-[10px] text-muted-foreground">Pre-tournament (Apr 2025)</span>}
      </div>
      {rankings.map((r) => {
        const moved = r.prevRank - r.rank
        const confColor = CONF_COLORS[r.confederation] ?? "bg-muted text-muted-foreground"
        return (
          <div key={r.rank} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="w-7 text-right shrink-0">
              <span className={`text-sm font-bold ${r.rank <= 10 ? "text-foreground" : "text-muted-foreground"}`}>
                {r.rank}
              </span>
            </div>
            <div className="w-4 shrink-0">
              {moved > 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-500" />
              ) : moved < 0 ? (
                <TrendingDown className="w-3 h-3 text-rose-500" />
              ) : (
                <Minus className="w-3 h-3 text-muted-foreground/40" />
              )}
            </div>
            {r.flag ? (
              <img src={r.flag} alt={r.name} className="w-6 h-4 object-cover rounded-sm shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
            ) : (
              <div className="w-6 h-4 bg-muted rounded-sm shrink-0" />
            )}
            <span className="flex-1 text-sm font-medium truncate">{r.name}</span>
            {r.confederation && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full hidden sm:inline ${confColor}`}>
                {r.confederation}
              </span>
            )}
            <span className="text-sm font-bold tabular-nums text-muted-foreground w-16 text-right shrink-0">
              {r.points.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Bracket Tab ────────────────────────────────────────────────────────────────

function BracketTab() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium mb-1">Knockout bracket</p>
      <p className="text-xs">Available after the group stage (June 26)</p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "scores", label: "Scores" },
  { id: "groups", label: "Groups" },
  { id: "rankings", label: "Rankings" },
  { id: "bracket", label: "Bracket" },
] as const

type TabId = typeof TABS[number]["id"]

export function WorldCupContent() {
  const [tab, setTab] = useState<TabId>("scores")

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">2026 FIFA World Cup</h1>
          <p className="text-xs text-muted-foreground">USA · Canada · Mexico — Jun 11 – Jul 19, 2026</p>
        </div>
        <a
          href="/api/worldcup/calendar"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          title="Add all matches to your calendar"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add to Calendar</span>
        </a>
      </div>

      {/* Sticky tabs */}
      <div className="sticky top-0 z-20 bg-background/70 backdrop-blur-md border-b border-border/50 -mx-4 px-4 lg:-mx-6 lg:px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {tab === "scores" && <ScoresTab />}
        {tab === "groups" && <StandingsTab />}
        {tab === "rankings" && <RankingsTab />}
        {tab === "bracket" && <BracketTab />}
      </div>
    </div>
  )
}
