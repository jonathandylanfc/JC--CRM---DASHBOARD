"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Plus,
  Trash2,
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
import { toast } from "sonner"

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
  calendarName?: string
  source?: "google" | "ics"
}

interface CalendarSource {
  id: string | null
  name: string
  color: string
  source: "google" | "ics"
  icsId?: string
}

interface IcsSub {
  id: string
  name: string
  ics_url: string
  color: string
}

const COLOR_OPTIONS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#f97316",
]

function formatEventTime(e: CalEvent) {
  if (e.allDay) return "All day"
  if (!e.start) return ""
  return format(parseISO(e.start), "h:mm a")
}

export function CalendarContent() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([])
  const [icsSubs, setIcsSubs] = useState<IcsSub[]>([])
  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(new Set())
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [addCalOpen, setAddCalOpen] = useState(false)
  const [icsName, setIcsName] = useState("")
  const [icsUrl, setIcsUrl] = useState("")
  const [icsColor, setIcsColor] = useState(COLOR_OPTIONS[0])
  const [addingIcs, setAddingIcs] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [gRes, icsRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/calendar/ics"),
      ])
      const gData = await gRes.json()
      const icsData = await icsRes.json()

      if (gData.error === "not_connected") {
        setConnected(false)
      } else if (gData.events) {
        setConnected(true)
        setGoogleEmail(gData.googleEmail ?? null)
        setCalendarSources(gData.calendarSources ?? [])

        const icsEvents: CalEvent[] = icsData.events ?? []
        const icsSubsList: IcsSub[] = icsData.subscriptions ?? []
        setIcsSubs(icsSubsList)

        // Build ICS calendar sources for sidebar
        const icsCalSources: CalendarSource[] = icsSubsList.map((s) => ({
          id: `ics-${s.id}`,
          name: s.name,
          color: s.color,
          source: "ics",
          icsId: s.id,
        }))

        setCalendarSources((prev) => {
          const googleSources = (gData.calendarSources ?? []) as CalendarSource[]
          return [...googleSources, ...icsCalSources]
        })
        setEvents([...gData.events, ...icsEvents])
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "1") {
      window.history.replaceState({}, "", "/calendar")
    }
    fetchAll()
  }, [fetchAll])

  async function handleDisconnect() {
    setDisconnecting(true)
    await fetch("/api/calendar/disconnect", { method: "POST" })
    setConnected(false)
    setEvents([])
    setGoogleEmail(null)
    setCalendarSources([])
    setDisconnecting(false)
  }

  async function handleAddIcs() {
    if (!icsName.trim() || !icsUrl.trim()) return
    setAddingIcs(true)
    try {
      const res = await fetch("/api/calendar/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: icsName.trim(), ics_url: icsUrl.trim(), color: icsColor }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`"${icsName}" added!`)
        setAddCalOpen(false)
        setIcsName("")
        setIcsUrl("")
        setIcsColor(COLOR_OPTIONS[0])
        fetchAll(true)
      }
    } finally {
      setAddingIcs(false)
    }
  }

  async function handleRemoveIcs(id: string, name: string) {
    await fetch("/api/calendar/ics", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    toast.success(`"${name}" removed`)
    fetchAll(true)
  }

  function toggleCalendar(calId: string) {
    setHiddenCalendars((prev) => {
      const next = new Set(prev)
      if (next.has(calId)) next.delete(calId)
      else next.add(calId)
      return next
    })
  }

  // Filter events by hidden calendars
  const visibleEvents = events.filter((e) => {
    const src = calendarSources.find(
      (c) => e.calendarName === c.name && e.source === c.source
    )
    if (!src) return true
    const key = src.id ?? src.name
    return !hiddenCalendars.has(key)
  })

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const dayEvents = visibleEvents.filter(
    (e) => e.start && isSameDay(parseISO(e.start), selectedDay)
  )

  function dayDots(day: Date) {
    const dayEvts = visibleEvents.filter((e) => e.start && isSameDay(parseISO(e.start), day))
    const colors = [...new Set(dayEvts.map((e) => e.color ?? "#4285f4"))].slice(0, 3)
    return colors
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

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
            <svg className="w-4 h-4" viewBox="0 0 24 24">
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
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
          {googleEmail && <span className="text-xs text-muted-foreground hidden sm:block">{googleEmail}</span>}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setAddCalOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Calendar
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => fetchAll(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting} title="Disconnect Google Calendar">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendars sidebar */}
        <Card className="p-4 h-fit">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">My Calendars</p>
          <div className="space-y-1.5">
            {calendarSources.map((cal) => {
              const key = cal.id ?? cal.name
              const hidden = hiddenCalendars.has(key)
              return (
                <div key={key} className="flex items-center justify-between gap-2 group">
                  <button
                    onClick={() => toggleCalendar(key)}
                    className="flex items-center gap-2 text-sm flex-1 text-left"
                  >
                    <span
                      className="w-3 h-3 rounded-sm shrink-0 transition-opacity"
                      style={{ backgroundColor: cal.color, opacity: hidden ? 0.3 : 1 }}
                    />
                    <span className={`truncate ${hidden ? "line-through text-muted-foreground" : ""}`}>
                      {cal.name}
                    </span>
                  </button>
                  {cal.source === "ics" && cal.icsId && (
                    <button
                      onClick={() => handleRemoveIcs(cal.icsId!, cal.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Main grid + day panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* Calendar grid */}
          <Card className="p-4 sm:p-6">
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day) => {
                const isSelected = isSameDay(day, selectedDay)
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const todayDay = isToday(day)
                const dots = dayDots(day)
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={`
                      relative flex flex-col items-center justify-start pt-1.5 pb-2 rounded-lg text-sm transition-all min-h-[48px]
                      ${isSelected ? "bg-primary text-primary-foreground" : todayDay ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"}
                      ${!isCurrentMonth ? "opacity-30" : ""}
                    `}
                  >
                    <span>{format(day, "d")}</span>
                    {dots.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dots.map((color, i) => (
                          <span
                            key={i}
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: isSelected ? "white" : color }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Day panel */}
          <Card className="p-4 sm:p-6">
            <div className="mb-4">
              <p className="font-semibold text-base">{format(selectedDay, "EEEE")}</p>
              <p className="text-sm text-muted-foreground">{format(selectedDay, "MMMM d, yyyy")}</p>
            </div>
            {dayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                <CalendarDays className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No events this day</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((e, i) => (
                  <div key={e.id ?? i} className="flex gap-3 items-start p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                    <div className="w-1 rounded-full self-stretch shrink-0 mt-0.5" style={{ backgroundColor: e.color ?? "#4285f4" }} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium leading-snug">{e.title}</p>
                        {e.htmlLink && (
                          <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{formatEventTime(e)}</Badge>
                        {e.calendarName && (
                          <span className="text-[10px] text-muted-foreground">{e.calendarName}</span>
                        )}
                      </div>
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
      </div>

      {/* Upcoming strip */}
      {visibleEvents.length > 0 && (() => {
        const upcoming = visibleEvents
          .filter((e) => e.start && parseISO(e.start) >= new Date())
          .slice(0, 5)
        if (!upcoming.length) return null
        return (
          <Card className="p-4 sm:p-6">
            <p className="font-semibold text-sm mb-3">Upcoming</p>
            <div className="space-y-2">
              {upcoming.map((e, i) => (
                <div key={e.id ?? i} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? "#4285f4" }} />
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

      {/* Add Calendar dialog */}
      <Dialog open={addCalOpen} onOpenChange={setAddCalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Calendar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Add any calendar that has a public <span className="font-medium">.ics</span> link — Apple Calendar, subscribed calendars, sports schedules, etc.
          </p>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Calendar name</Label>
              <Input
                placeholder="e.g. Apple Calendar, Work, NFL Schedule"
                value={icsName}
                onChange={(e) => setIcsName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Calendar URL (.ics link)</Label>
              <Input
                placeholder="webcal:// or https://..."
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Apple: iCloud.com → Calendar → right-click calendar → Share → Public Calendar → Copy Link
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setIcsColor(c)}
                    className={`w-6 h-6 rounded-full transition-all ${icsColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleAddIcs}
              disabled={addingIcs || !icsName.trim() || !icsUrl.trim()}
            >
              {addingIcs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addingIcs ? "Verifying…" : "Add Calendar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
