"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react"

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

function TeamLogo({ logo, name, size = 24 }: { logo: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (!logo || err) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >
        {name.slice(0, 3).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={logo}
      alt={name}
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
  // Upcoming — show local kickoff time
  const t = kickoffTime(date)
  return <span className="text-[10px] font-semibold text-muted-foreground">{t}</span>
}

function MatchCard({ match }: { match: Match }) {
  const isLive = match.status.state === "in"
  const isDone = match.status.state === "post"
  const homeWin = isDone && match.homeTeam.score !== null && match.awayTeam.score !== null &&
    parseInt(match.homeTeam.score) > parseInt(match.awayTeam.score)
  const awayWin = isDone && match.homeTeam.score !== null && match.awayTeam.score !== null &&
    parseInt(match.awayTeam.score) > parseInt(match.homeTeam.score)

  return (
    <div className={`rounded-xl border p-3 transition-all ${isLive ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
      {match.group && (
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{match.group}</p>
      )}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TeamLogo logo={match.homeTeam.logo} name={match.homeTeam.abbr} size={28} />
          <span className={`text-sm font-semibold truncate ${homeWin ? "text-foreground" : isDone ? "text-muted-foreground" : "text-foreground"}`}>
            {match.homeTeam.abbr}
          </span>
        </div>

        {/* Score / Time */}
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

        {/* Away */}
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

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00") // noon local to avoid DST edge
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(d, today)) return "Today"
  if (isSameDay(d, yesterday)) return "Yesterday"
  if (isSameDay(d, tomorrow)) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function ScoresTab() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const todayRef = useRef<HTMLDivElement>(null)
  const scrolledRef = useRef(false)

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

  // Scroll to today once data loads
  useEffect(() => {
    if (!loading && matches.length && !scrolledRef.current) {
      scrolledRef.current = true
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: "instant", block: "start" })
      }, 50)
    }
  }, [loading, matches.length])

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

  // Group matches by local date, sorted chronologically
  const today = new Date().toISOString().slice(0, 10)
  const byDate = new Map<string, Match[]>()
  for (const m of [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const key = new Date(m.date).toLocaleDateString("en-CA") // YYYY-MM-DD in local time
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(m)
  }
  const sortedDates = Array.from(byDate.keys()).sort()

  return (
    <div className="space-y-6">
      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-right">
          Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
      )}

      {sortedDates.map((date) => {
        const dayMatches = byDate.get(date)!
        const isToday = date === today
        const hasLive = dayMatches.some((m) => m.status.state === "in")
        const label = formatDayHeader(date)

        return (
          <div key={date} ref={isToday ? todayRef : undefined} className="space-y-2 scroll-mt-4">
            {/* Date header */}
            <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-1.5 z-10">
              <h3 className={`text-sm font-bold ${isToday ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </h3>
              {isToday && (
                <span className="text-[10px] font-bold text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">
                  TODAY
                </span>
              )}
              {hasLive && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Matches for this day */}
            <div className="space-y-2">
              {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Standings Tab ──────────────────────────────────────────────────────────────

function StandingsTab() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/worldcup/standings")
      .then((r) => r.json())
      .then((d) => { setGroups(d.groups ?? []); setLoading(false) })
      .catch(() => setLoading(false))
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

  if (!groups.length) {
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
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry, idx) => {
                const isQ = idx < 2 // top 2 advance (simplified — 2026 format has top 2 + best 3rd)
                return (
                  <tr
                    key={entry.team.abbr}
                    className={`border-b border-border/30 last:border-0 ${isQ ? "bg-emerald-500/5" : ""}`}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo logo={entry.team.logo} name={entry.team.abbr} size={16} />
                        <span className="font-medium truncate max-w-[80px]">{entry.team.short}</span>
                      </div>
                    </td>
                    <td className="text-center px-1 py-1.5 text-muted-foreground">{entry.gp}</td>
                    <td className="text-center px-1 py-1.5">{entry.w}</td>
                    <td className="text-center px-1 py-1.5">{entry.d}</td>
                    <td className="text-center px-1 py-1.5">{entry.l}</td>
                    <td className="text-center px-1 py-1.5 text-muted-foreground">
                      {entry.gd > 0 ? `+${entry.gd}` : entry.gd}
                    </td>
                    <td className="text-center px-2 py-1.5 font-bold">{entry.pts}</td>
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
      .then((d) => { setRankings(d.rankings ?? []); setSource(d.source ?? ""); setLoading(false) })
      .catch(() => setLoading(false))
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">2026 FIFA World Cup</h1>
          <p className="text-xs text-muted-foreground">USA · Canada · Mexico — Jun 11 – Jul 19, 2026</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "scores" && <ScoresTab />}
        {tab === "groups" && <StandingsTab />}
        {tab === "rankings" && <RankingsTab />}
        {tab === "bracket" && <BracketTab />}
      </div>
    </div>
  )
}
