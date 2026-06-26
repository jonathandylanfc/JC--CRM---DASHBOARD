"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, CalendarPlus, X, CheckCircle2, Circle, CalendarCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Team { name: string; abbr: string; logo: string | null; score: string | null }
interface MatchStatus { state: "pre" | "in" | "post"; detail: string; shortDetail: string; completed: boolean; clock: string | null; period: number | null }
interface Match { id: string; date: string; homeTeam: Team; awayTeam: Team; status: MatchStatus; venue: string | null; group: string | null }

interface ScoringPlay { scorer: string; minute: string; team: "home" | "away"; type: "goal" | "own_goal" | "penalty" }

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
    return null
  }
  const t = kickoffTime(date)
  return <span className="text-[10px] font-semibold text-muted-foreground">{t}</span>
}

function GoalIcon({ type }: { type: ScoringPlay["type"] }) {
  if (type === "own_goal") return <span className="text-[11px]" title="Own goal">⚽️</span>
  if (type === "penalty") return <span className="text-[11px]" title="Penalty">⚽️ (P)</span>
  return <span className="text-[11px]">⚽️</span>
}

function MatchCard({
  match,
  selectable = false,
  selected = false,
  onToggle,
}: {
  match: Match
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const isLive = match.status.state === "in"
  const isDone = match.status.state === "post"
  const canExpand = isLive || isDone
  const homeScore = parseInt(match.homeTeam.score ?? "", 10)
  const awayScore = parseInt(match.awayTeam.score ?? "", 10)
  const homeWin = isDone && !isNaN(homeScore) && !isNaN(awayScore) && homeScore > awayScore
  const awayWin = isDone && !isNaN(homeScore) && !isNaN(awayScore) && awayScore > homeScore

  const [expanded, setExpanded] = useState(false)
  const [plays, setPlays] = useState<ScoringPlay[] | null>(null)
  const [loadingPlays, setLoadingPlays] = useState(false)

  const handleCardClick = () => {
    if (selectable) { onToggle?.(); return }
    if (!canExpand) return
    if (!expanded && plays === null) {
      setLoadingPlays(true)
      fetch(`/api/worldcup/match?id=${match.id}`)
        .then((r) => r.json())
        .then((d) => setPlays(d.scoringPlays ?? []))
        .catch(() => setPlays([]))
        .finally(() => setLoadingPlays(false))
    }
    setExpanded((v) => !v)
  }

  const homePlays = plays?.filter((p) => p.team === "home") ?? []
  const awayPlays = plays?.filter((p) => p.team === "away") ?? []

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-xl border p-3 transition-all backdrop-blur-sm relative ${
        canExpand || selectable ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : isLive
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/60 bg-card/60"
      }`}
    >
      {selectable && (
        <div className="absolute top-2 right-2">
          {selected ? (
            <CheckCircle2 className="w-4 h-4 text-primary" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground/40" />
          )}
        </div>
      )}
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
          {isDone && (
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Final</span>
          )}
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

      {/* Expanded scorer section */}
      {canExpand && !selectable && expanded && (
        <div className="mt-2 pt-2 border-t border-border/40">
          {loadingPlays ? (
            <div className="flex justify-center py-1">
              <div className="w-4 h-4 rounded-full border-2 border-border border-t-muted-foreground animate-spin" />
            </div>
          ) : plays !== null && plays.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-0.5">No scoring data available</p>
          ) : plays !== null ? (
            <div className="flex gap-4 justify-between text-[11px]">
              <div className="flex-1 space-y-1">
                {homePlays.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 text-foreground/80">
                    <GoalIcon type={p.type} />
                    <span className="text-muted-foreground tabular-nums">{p.minute}&apos;</span>
                    <span className="truncate">{p.scorer}</span>
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-1 items-end flex flex-col">
                {awayPlays.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 text-foreground/80 flex-row-reverse">
                    <GoalIcon type={p.type} />
                    <span className="text-muted-foreground tabular-nums">{p.minute}&apos;</span>
                    <span className="truncate text-right">{p.scorer}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {canExpand && !selectable && (
        <div className="flex justify-center mt-1.5 -mb-0.5">
          {expanded
            ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
            : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
        </div>
      )}
    </div>
  )
}

// ── Calendar Picker Modal ──────────────────────────────────────────────────────

interface CalSource { id: string; name: string; color: string }

function CalendarPickerModal({
  matches,
  onClose,
}: {
  matches: Match[]
  onClose: () => void
}) {
  const [calendars, setCalendars] = useState<CalSource[]>([])
  const [loadingCals, setLoadingCals] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [pickedId, setPickedId] = useState("")
  const [adding, setAdding] = useState(false)
  const [done, setDone] = useState<{ created: number; updated: number; failed: number } | null>(null)

  useEffect(() => {
    fetch("/api/calendar/events")
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "not_connected" || !d.calendarSources) { setNotConnected(true); return }
        const cals: CalSource[] = (d.calendarSources as Array<{ id: string | null; name: string; color: string }>)
          .filter((c) => c.id)
          .map((c) => ({ id: c.id!, name: c.name, color: c.color }))
        setCalendars(cals)
        if (cals.length > 0) setPickedId(cals[0].id)
      })
      .catch(() => setNotConnected(true))
      .finally(() => setLoadingCals(false))
  }, [])

  const handleAdd = async () => {
    if (!pickedId) return
    setAdding(true)
    try {
      const r = await fetch("/api/calendar/worldcup-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches, calendarId: pickedId }),
      })
      const d = await r.json()
      setDone({ created: d.created ?? 0, updated: d.updated ?? 0, failed: d.errors?.length ?? 0 })
    } catch {
      setDone({ created: 0, updated: 0, failed: matches.length })
    }
    setAdding(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-4 h-4" />
            Add to Calendar
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-4 text-center space-y-2">
            <CalendarCheck className="w-10 h-10 mx-auto text-emerald-500" />
            {done.created > 0 && (
              <p className="font-semibold text-sm">
                {done.created} {done.created === 1 ? "game" : "games"} added!
              </p>
            )}
            {done.updated > 0 && (
              <p className="font-semibold text-sm">
                {done.updated} {done.updated === 1 ? "event" : "events"} updated with latest teams!
              </p>
            )}
            {done.failed > 0 && (
              <p className="text-xs text-rose-500">{done.failed} failed</p>
            )}
            <button
              onClick={onClose}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Adding <span className="font-semibold text-foreground">{matches.length}</span>{" "}
              {matches.length === 1 ? "game" : "games"} to:
            </p>

            {loadingCals ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : notConnected ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <p className="font-medium mb-1">Google Calendar not connected</p>
                <p className="text-xs">Connect it in Settings → Calendar</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {calendars.map((cal) => (
                  <button
                    key={cal.id}
                    onClick={() => setPickedId(cal.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                      pickedId === cal.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color }}
                    />
                    <span className="truncate">{cal.name}</span>
                    {pickedId === cal.id && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {!notConnected && !loadingCals && (
              <button
                onClick={handleAdd}
                disabled={adding || !pickedId}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
              >
                {adding ? "Adding…" : `Add ${matches.length} ${matches.length === 1 ? "game" : "games"}`}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function DateSection({
  date,
  matches,
  isToday,
  selectable = false,
  selectedIds,
  onToggle,
}: {
  date: string
  matches: Match[]
  isToday: boolean
  selectable?: boolean
  selectedIds?: Set<string>
  onToggle?: (id: string) => void
}) {
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
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            selectable={selectable && m.status.state === "pre"}
            selected={selectedIds?.has(m.id) ?? false}
            onToggle={() => onToggle?.(m.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ScoresTab() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCalModal, setShowCalModal] = useState(false)
  const upcomingAnchorRef = useRef<HTMLDivElement>(null)

  const handleHistoryToggle = useCallback(() => {
    if (showHistory) {
      const anchor = upcomingAnchorRef.current
      const prevTop = anchor?.getBoundingClientRect().top ?? 0
      setShowHistory(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (anchor) {
            const newTop = anchor.getBoundingClientRect().top
            window.scrollBy({ top: newTop - prevTop, behavior: "instant" })
          }
        })
      })
    } else {
      setShowHistory(true)
    }
  }, [showHistory])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const enterSelectMode = useCallback(() => {
    // Pre-select every upcoming (not yet started) match
    const futureIds = new Set(
      matches.filter((m) => m.status.state === "pre").map((m) => m.id)
    )
    setSelectedIds(futureIds)
    setSelectMode(true)
  }, [matches])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

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

  const selectedMatches = matches.filter((m) => selectedIds.has(m.id))

  return (
    <div className="space-y-6 pb-24">
      {/* Floating pill to hide history while scrolling */}
      {showHistory && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={handleHistoryToggle}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            Hide game history
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        {lastUpdated ? (
          <p className="text-[10px] text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        ) : <span />}
        {selectMode ? (
          <button
            onClick={exitSelectMode}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        ) : (
          <button
            onClick={enterSelectMode}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors hover:bg-muted/40"
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Add games to calendar
          </button>
        )}
      </div>

      {selectMode && (
        <p className="text-xs text-muted-foreground -mt-2">
          All upcoming games are selected — tap any to remove it.
        </p>
      )}

      {/* History toggle button */}
      {pastDates.length > 0 && !showHistory && (
        <button
          onClick={handleHistoryToggle}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-lg transition-colors bg-card/30 backdrop-blur-sm"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Load game history ({totalPastMatches} matches)
        </button>
      )}

      {/* Past matches — most recent last so it appears closest to Today */}
      {showHistory && pastDates.map((date) => (
        <DateSection key={date} date={date} matches={byDate.get(date)!} isToday={false} />
      ))}

      {/* Today and upcoming — anchor keeps viewport stable when history is hidden */}
      <div ref={upcomingAnchorRef} />
      {currentAndFutureDates.map((date) => (
        <DateSection
          key={date}
          date={date}
          matches={byDate.get(date)!}
          isToday={date === today}
          selectable={selectMode}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
        />
      ))}

      {/* Sticky add bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
          <span className="text-sm font-semibold">
            {selectedIds.size} {selectedIds.size === 1 ? "game" : "games"} selected
          </span>
          <button
            onClick={() => setShowCalModal(true)}
            className="flex items-center gap-1.5 text-sm font-bold bg-primary-foreground text-primary rounded-xl px-3 py-1.5 transition-opacity hover:opacity-80"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Add to Calendar
          </button>
        </div>
      )}

      {showCalModal && (
        <CalendarPickerModal
          matches={selectedMatches}
          onClose={() => {
            setShowCalModal(false)
            exitSelectMode()
          }}
        />
      )}
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
        <span className="text-[10px] text-muted-foreground">
          {source === "live" ? "Live · fifa.com" : "Last known · Jun 25"}
        </span>
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

interface BracketTeam { name: string; shortName: string; logo: string | null; score: number | null }
interface BracketMatch {
  id: string; date: string; round: string; roundOrder: number
  home: BracketTeam; away: BracketTeam; venue: string
  status: "scheduled" | "in_progress" | "final"; winner: "home" | "away" | null
}

function BracketMatchCard({ match }: { match: BracketMatch }) {
  const isLive = match.status === "in_progress"
  const isFinal = match.status === "final"
  const d = new Date(match.date)
  const dateStr = isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const timeStr = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })

  const teamRow = (team: BracketTeam, side: "home" | "away") => {
    const isWinner = match.winner === side
    const isTBD = team.name === "TBD" || team.name.startsWith("Third Place") || team.name.startsWith("Winner")
    return (
      <div className={`flex items-center gap-2.5 py-2 px-3 ${isWinner ? "opacity-100" : isFinal && !isWinner ? "opacity-50" : "opacity-90"}`}>
        <TeamLogo logo={isTBD ? null : team.logo} name={team.shortName} size={22} />
        <span className={`flex-1 text-sm ${isWinner ? "font-semibold text-foreground" : "text-foreground/80"} truncate`}>
          {team.name}
        </span>
        {(isFinal || isLive) && team.score != null && (
          <span className={`text-sm font-bold tabular-nums ${isWinner ? "text-foreground" : "text-muted-foreground"}`}>
            {team.score}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden">
      <div className="divide-y divide-border/40">
        {teamRow(match.home, "home")}
        {teamRow(match.away, "away")}
      </div>
      <div className="px-3 py-1.5 bg-muted/20 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground truncate">{match.venue || dateStr}</span>
        {isLive ? (
          <span className="text-[10px] font-bold text-emerald-500 animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />LIVE
          </span>
        ) : isFinal ? (
          <span className="text-[10px] text-muted-foreground">FT</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">{dateStr} · {timeStr}</span>
        )}
      </div>
    </div>
  )
}

const TBD_ROUNDS = [
  { label: "Final", count: 1, cols: 1, isFinal: true },
  { label: "Semifinals", count: 2, cols: 2, isFinal: false },
  { label: "Quarterfinals", count: 4, cols: 2, isFinal: false },
  { label: "Round of 16", count: 8, cols: 1, isFinal: false },
  { label: "Round of 32", count: 16, cols: 1, isFinal: false },
]

function TbdMatchCard() {
  return (
    <div className="bg-card/40 border border-dashed border-border/40 rounded-xl overflow-hidden opacity-50">
      <div className="divide-y divide-border/30">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2.5 py-2 px-3">
            <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
            <span className="text-sm text-muted-foreground">TBD</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketRoundHeader({ label, isFinal }: { label: string; isFinal?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2">
      {isFinal ? (
        <span className="text-sm font-bold text-yellow-500 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" />{label}
        </span>
      ) : (
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h3>
      )}
      <div className="flex-1 h-px bg-border/40" />
    </div>
  )
}

function BracketTab() {
  const [matches, setMatches] = useState<BracketMatch[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch("/api/worldcup/bracket")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => setError(true))
  }, [])

  if (error) return (
    <div className="text-center py-12 text-muted-foreground text-sm">Failed to load bracket</div>
  )

  if (!matches) return (
    <div className="space-y-5 animate-pulse">
      {TBD_ROUNDS.slice(0, 3).map((r) => (
        <div key={r.label}>
          <div className="h-3.5 w-24 rounded bg-muted/50 mb-2 ml-1" />
          <div className={`grid gap-2 ${r.cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {Array.from({ length: r.count }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/30" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  if (matches.length === 0) {
    return (
      <div className="space-y-5 pb-24">
        <p className="text-[10px] text-muted-foreground px-1">Knockout stage begins Jun 29 · bracket fills as teams advance</p>
        {TBD_ROUNDS.map((r) => (
          <div key={r.label}>
            <BracketRoundHeader label={r.label} isFinal={r.isFinal} />
            <div className={`grid gap-2 ${r.cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {Array.from({ length: r.count }).map((_, i) => <TbdMatchCard key={i} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const byRound: Record<string, BracketMatch[]> = {}
  for (const m of matches) {
    if (!byRound[m.round]) byRound[m.round] = []
    byRound[m.round].push(m)
  }

  const rounds = Object.entries(byRound).sort(([, a], [, b]) => a[0].roundOrder - b[0].roundOrder)
  const multiColRounds = new Set(["Quarterfinals", "Semifinals"])

  return (
    <div className="space-y-5 pb-24">
      {rounds.map(([round, roundMatches]) => (
        <div key={round}>
          <BracketRoundHeader label={round} isFinal={round === "Final"} />
          <div className={`gap-2 ${multiColRounds.has(round) ? "grid grid-cols-2" : "space-y-2"}`}>
            {roundMatches.map((m) => <BracketMatchCard key={m.id} match={m} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── News Tab ───────────────────────────────────────────────────────────────────

interface NewsArticle {
  id: string
  headline: string
  description: string
  published: string
  url: string
  imageUrl: string | null
  byline: string | null
  isBrazil: boolean
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/worldcup/news")
      .then((r) => r.json())
      .then((d) => setArticles(d.articles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!articles.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No news available right now</p>
      </div>
    )
  }

  const brazilArticles = articles.filter((a) => a.isBrazil)
  const otherArticles = articles.filter((a) => !a.isBrazil)

  return (
    <div className="space-y-5 pb-24">
      {brazilArticles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🇧🇷</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Brazil</h3>
            <div className="flex-1 h-px bg-border" />
          </div>
          {brazilArticles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}

      {otherArticles.length > 0 && (
        <div className="space-y-2">
          {brazilArticles.length > 0 && (
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">More News</h3>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          {otherArticles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}
    </div>
  )
}

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-card transition-colors"
    >
      {article.imageUrl && (
        <img
          src={article.imageUrl}
          alt=""
          className="w-20 h-16 rounded-lg object-cover shrink-0 bg-muted"
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{article.headline}</p>
        {article.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{article.description}</p>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {article.byline && <span className="truncate">{article.byline}</span>}
          {article.byline && <span>·</span>}
          {article.published && <span className="shrink-0">{timeAgo(article.published)}</span>}
        </div>
      </div>
    </a>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "scores", label: "Scores" },
  { id: "groups", label: "Groups" },
  { id: "rankings", label: "Rankings" },
  { id: "bracket", label: "Bracket" },
  { id: "news", label: "News" },
] as const

type TabId = typeof TABS[number]["id"]

const TAB_IDS = TABS.map((t) => t.id) as TabId[]

export function WorldCupContent() {
  const [tab, setTab] = useState<TabId>("scores")
  const scrollRef = useRef<HTMLDivElement>(null)
  const isProgrammatic = useRef(false)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeIndex = TAB_IDS.indexOf(tab)

  // Scroll the panel strip when a tab button is clicked
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    isProgrammatic.current = true
    el.scrollTo({ left: activeIndex * el.offsetWidth, behavior: "smooth" })
    if (snapTimer.current) clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => { isProgrammatic.current = false }, 600)
  }, [activeIndex])

  // Update the active tab indicator when the user swipes
  const handleScroll = useCallback(() => {
    if (isProgrammatic.current) return
    const el = scrollRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.offsetWidth)
    const next = TAB_IDS[index]
    if (next && next !== tab) setTab(next)
  }, [tab])

  return (
    <div className="space-y-0">
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md -mx-4 px-4 lg:-mx-6 lg:px-6 border-b border-border/50 pb-0">
        <div className="flex items-center gap-3 pt-3 pb-2">
          <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight">2026 FIFA World Cup</h1>
            <p className="text-[10px] text-muted-foreground">USA · Canada · Mexico — Jun 11 – Jul 19</p>
          </div>
          <a
            href="/api/worldcup/calendar"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            title="Add all matches to your calendar"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Calendar</span>
          </a>
        </div>

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

      {/* Horizontally scrollable panel strip — swipe or tap tabs to navigate */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="wc-tabs-scroll flex overflow-x-auto snap-x snap-mandatory pt-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="w-full shrink-0 snap-start snap-always"><ScoresTab /></div>
        <div className="w-full shrink-0 snap-start snap-always"><StandingsTab /></div>
        <div className="w-full shrink-0 snap-start snap-always"><RankingsTab /></div>
        <div className="w-full shrink-0 snap-start snap-always"><BracketTab /></div>
        <div className="w-full shrink-0 snap-start snap-always"><NewsTab /></div>
      </div>
    </div>
  )
}
