"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ExternalLink,
  MapPin,
  RefreshCw,
  LogOut,
  Loader2,
} from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  startOfWeek,
  endOfWeek,
} from "date-fns"

interface CalEvent {
  id: string | null | undefined
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
  color: string | null
  htmlLink: string | null
}

const GOOGLE_COLOR_MAP: Record<string, string> = {
  "1": "bg-blue-500",
  "2": "bg-green-500",
  "3": "bg-purple-500",
  "4": "bg-rose-500",
  "5": "bg-amber-500",
  "6": "bg-orange-500",
  "7": "bg-teal-500",
  "8": "bg-gray-500",
  "9": "bg-indigo-500",
  "10": "bg-green-600",
  "11": "bg-red-500",
}

function eventColor(e: CalEvent) {
  return e.color ? (GOOGLE_COLOR_MAP[e.color] ?? "bg-primary") : "bg-primary"
}

function formatEventTime(e: CalEvent) {
  if (e.allDay) return "All day"
  if (!e.start) return ""
  return format(parseISO(e.start), "h:mm a")
}

export function CalendarContent() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null) // null = loading
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch("/api/calendar/events")
      const data = await res.json()
      if (data.error === "not_connected") {
        setConnected(false)
      } else if (data.events) {
        setEvents(data.events)
        setGoogleEmail(data.googleEmail ?? null)
        setConnected(true)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Check for ?connected=1 or ?error=... in URL
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "1") {
      window.history.replaceState({}, "", "/calendar")
    }
    fetchEvents()
  }, [fetchEvents])

  async function handleDisconnect() {
    setDisconnecting(true)
    await fetch("/api/calendar/disconnect", { method: "POST" })
    setConnected(false)
    setEvents([])
    setGoogleEmail(null)
    setDisconnecting(false)
  }

  // Build calendar grid (6-week grid starting from Sunday)
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Events for selected day
  const dayEvents = events.filter((e) => {
    if (!e.start) return false
    const start = parseISO(e.start)
    return isSameDay(start, selectedDay)
  })

  // Events for a given grid day (for dots)
  function dayHasEvent(day: Date) {
    return events.some((e) => e.start && isSameDay(parseISO(e.start), day))
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // ── Not connected ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <CalendarDays className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Connect your Google Calendar</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Sync your events and see everything in one place. Your data stays private — read-only access.
          </p>
        </div>
        <a href="/api/calendar/auth">
          <Button className="gap-2 h-10">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect Google Calendar
          </Button>
        </a>
      </div>
    )
  }

  // ── Connected ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()) }}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {googleEmail && (
            <span className="text-xs text-muted-foreground hidden sm:block">{googleEmail}</span>
          )}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => fetchEvents(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting} title="Disconnect Google Calendar">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <Card className="lg:col-span-2 p-4 sm:p-6">
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const isSelected = isSameDay(day, selectedDay)
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const hasEvent = dayHasEvent(day)
              const todayDay = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    relative flex flex-col items-center justify-start pt-1.5 pb-2 rounded-lg text-sm transition-all min-h-[44px]
                    ${isSelected ? "bg-primary text-primary-foreground" : todayDay ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"}
                    ${!isCurrentMonth ? "opacity-30" : ""}
                  `}
                >
                  <span>{format(day, "d")}</span>
                  {hasEvent && (
                    <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Day events panel */}
        <Card className="p-4 sm:p-6 flex flex-col">
          <div className="mb-4">
            <p className="font-semibold text-base">{format(selectedDay, "EEEE")}</p>
            <p className="text-sm text-muted-foreground">{format(selectedDay, "MMMM d, yyyy")}</p>
          </div>

          {dayEvents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-8">
              <CalendarDays className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No events this day</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-80">
              {dayEvents.map((e, i) => (
                <div key={e.id ?? i} className="flex gap-3 items-start p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                  <div className={`w-1 rounded-full self-stretch shrink-0 mt-0.5 ${eventColor(e)}`} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium leading-snug">{e.title}</p>
                      {e.htmlLink && (
                        <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatEventTime(e)}
                    </Badge>
                    {e.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{e.location}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Upcoming events strip */}
      {events.length > 0 && (() => {
        const upcoming = events
          .filter((e) => e.start && parseISO(e.start) >= new Date())
          .slice(0, 5)
        if (!upcoming.length) return null
        return (
          <Card className="p-4 sm:p-6">
            <p className="font-semibold text-sm mb-3">Upcoming</p>
            <div className="space-y-2">
              {upcoming.map((e, i) => (
                <div key={e.id ?? i} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${eventColor(e)}`} />
                  <span className="font-medium truncate flex-1">{e.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {e.start ? format(parseISO(e.start), e.allDay ? "MMM d" : "MMM d, h:mm a") : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )
      })()}
    </div>
  )
}
