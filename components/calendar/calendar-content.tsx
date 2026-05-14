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
  DollarSign,
  Bell,
  Settings,
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
  source?: "google" | "ics" | "local"
  localId?: string
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

  // Finance events (bills + payday)
  const [billEvents, setBillEvents] = useState<Array<{ name: string; amount: number; category: string; nextDate: string }>>([])
  const [paydayDay, setPaydayDay] = useState<number | null>(null)
  const [paydayEvents, setPaydayEvents] = useState<Array<{ date: string }>>([])
  const [showBills, setShowBills] = useState(true)
  const [showPayday, setShowPayday] = useState(true)
  const [paydayDialogOpen, setPaydayDialogOpen] = useState(false)
  const [paydayInput, setPaydayInput] = useState("")
  const [savingPayday, setSavingPayday] = useState(false)

  // Add Event dialog
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [evTitle, setEvTitle] = useState("")
  const [evDate, setEvDate] = useState("")
  const [evStartTime, setEvStartTime] = useState("")
  const [evEndTime, setEvEndTime] = useState("")
  const [evLocation, setEvLocation] = useState("")
  const [evNotes, setEvNotes] = useState("")
  const [evAllDay, setEvAllDay] = useState(false)
  const [evColor, setEvColor] = useState("#10b981")
  const [savingEvent, setSavingEvent] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [gRes, icsRes, localRes, finRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/calendar/ics"),
        fetch("/api/calendar/local-events"),
        fetch("/api/calendar/finance-events"),
      ])
      const gData = await gRes.json()
      const icsData = await icsRes.json()
      const localData = await localRes.json()
      const finData = await finRes.json()

      // Finance events
      setBillEvents(finData.bills ?? [])
      setPaydayDay(finData.paydayDay ?? null)
      setPaydayEvents(finData.paydayEvents ?? [])

      if (gData.error === "not_connected") {
        setConnected(false)
      } else if (gData.events) {
        setConnected(true)
        setGoogleEmail(gData.googleEmail ?? null)

        const icsEvents: CalEvent[] = icsData.events ?? []
        const icsSubsList: IcsSub[] = icsData.subscriptions ?? []
        setIcsSubs(icsSubsList)

        const localEvents: CalEvent[] = (localData.events ?? []).map((e: {
          id: string; title: string; start_at: string; end_at: string | null;
          all_day: boolean; location: string | null; notes: string | null; color: string
        }) => ({
          id: `local-${e.id}`,
          localId: e.id,
          title: e.title,
          start: e.start_at,
          end: e.end_at,
          allDay: e.all_day,
          location: e.location,
          description: e.notes,
          color: e.color,
          htmlLink: null,
          calendarName: "My Events",
          source: "local" as const,
        }))

        const googleSources = (gData.calendarSources ?? []) as CalendarSource[]
        const icsCalSources: CalendarSource[] = icsSubsList.map((s) => ({
          id: `ics-${s.id}`,
          name: s.name,
          color: s.color,
          source: "ics" as const,
          icsId: s.id,
        }))

        setCalendarSources([...googleSources, ...icsCalSources])
        setEvents([...gData.events, ...icsEvents, ...localEvents])
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

  async function handleAddEvent() {
    if (!evTitle.trim() || !evDate) return
    setSavingEvent(true)
    try {
      const startAt = evAllDay ? `${evDate}T00:00:00` : `${evDate}T${evStartTime || "00:00"}:00`
      const endAt = evAllDay ? null : evEndTime ? `${evDate}T${evEndTime}:00` : null
      const res = await fetch("/api/calendar/local-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: evTitle.trim(),
          start_at: startAt,
          end_at: endAt,
          all_day: evAllDay,
          location: evLocation.trim() || null,
          notes: evNotes.trim() || null,
          color: evColor,
        }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      toast.success(`"${evTitle}" added!`)
      setAddEventOpen(false)
      setEvTitle(""); setEvDate(""); setEvStartTime(""); setEvEndTime("")
      setEvLocation(""); setEvNotes(""); setEvAllDay(false); setEvColor("#10b981")
      fetchAll(true)
    } finally {
      setSavingEvent(false)
    }
  }

  async function handleDeleteLocalEvent(localId: string, title: string) {
    await fetch("/api/calendar/local-events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: localId }),
    })
    toast.success(`"${title}" deleted`)
    fetchAll(true)
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
    const dayStr = format(day, "yyyy-MM-dd")
    const dayEvts = visibleEvents.filter((e) => e.start && isSameDay(parseISO(e.start), day))
    const colors = [...new Set(dayEvts.map((e) => e.color ?? "#4285f4"))]
    if (showBills && billEvents.some((b) => b.nextDate === dayStr)) colors.push("#f59e0b")
    if (showPayday && paydayEvents.some((p) => p.date === dayStr)) colors.push("#10b981")
    return colors.slice(0, 4)
  }

  async function handleSavePayday() {
    if (!paydayInput) return
    const day = parseInt(paydayInput)
    if (isNaN(day) || day < 1 || day > 31) return
    setSavingPayday(true)
    await fetch("/api/calendar/finance-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payday_day: day }),
    })
    setSavingPayday(false)
    setPaydayDialogOpen(false)
    fetchAll(true)
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
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setEvDate(format(selectedDay, "yyyy-MM-dd")); setAddEventOpen(true) }}>
            <Plus className="w-3.5 h-3.5" /> Add Event
          </Button>
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

      {/* My Calendars — inline pill row */}
      {calendarSources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">My Calendars:</span>
          {calendarSources.map((cal) => {
            const key = cal.id ?? cal.name
            const hidden = hiddenCalendars.has(key)
            return (
              <div key={key} className="flex items-center gap-1 group">
                <button
                  onClick={() => toggleCalendar(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
                    hidden
                      ? "border-border text-muted-foreground bg-transparent opacity-50"
                      : "border-transparent text-foreground"
                  }`}
                  style={{ backgroundColor: hidden ? undefined : cal.color + "22", borderColor: hidden ? undefined : cal.color + "66" }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cal.color, opacity: hidden ? 0.4 : 1 }} />
                  <span className={hidden ? "line-through" : ""}>{cal.name}</span>
                </button>
                {cal.source === "ics" && cal.icsId && (
                  <button
                    onClick={() => handleRemoveIcs(cal.icsId!, cal.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive -ml-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Finance calendar toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Finance:</span>
        <button
          onClick={() => setShowBills((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showBills ? "border-amber-400/60 bg-amber-400/10 text-foreground" : "border-border text-muted-foreground opacity-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" style={{ opacity: showBills ? 1 : 0.4 }} />
          <span className={showBills ? "" : "line-through"}>Bill Due Dates</span>
        </button>
        <button
          onClick={() => setShowPayday((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showPayday ? "border-emerald-400/60 bg-emerald-400/10 text-foreground" : "border-border text-muted-foreground opacity-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" style={{ opacity: showPayday ? 1 : 0.4 }} />
          <span className={showPayday ? "" : "line-through"}>Payday</span>
        </button>
        <button
          onClick={() => { setPaydayInput(paydayDay ? String(paydayDay) : ""); setPaydayDialogOpen(true) }}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
        >
          <Settings className="w-3 h-3" />
          {paydayDay ? `Payday: ${paydayDay}${["st","nd","rd"][((paydayDay % 10)-1)] ?? "th"}` : "Set Payday"}
        </button>
      </div>

      {/* Payday dialog */}
      <Dialog open={paydayDialogOpen} onOpenChange={(o) => { if (!o) setPaydayDialogOpen(false) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Set Payday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="payday-day">Day of month (1–31)</Label>
              <Input id="payday-day" type="number" min="1" max="31" placeholder="e.g. 15" value={paydayInput} onChange={(e) => setPaydayInput(e.target.value)} autoFocus />
              <p className="text-xs text-muted-foreground">Your payday will appear on the calendar each month.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setPaydayDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSavePayday} disabled={savingPayday || !paydayInput}>
                {savingPayday ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main grid + day panel */}
      <div className="space-y-6">
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
            {(() => {
              const dayStr = format(selectedDay, "yyyy-MM-dd")
              const dayBills = showBills ? billEvents.filter((b) => b.nextDate === dayStr) : []
              const isPayday = showPayday && paydayEvents.some((p) => p.date === dayStr)
              const hasExtra = dayBills.length > 0 || isPayday
              if (dayEvents.length === 0 && !hasExtra) return (
                <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                  <CalendarDays className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No events this day</p>
                </div>
              )
              return (
                <div className="space-y-2">
                  {isPayday && (
                    <div className="flex gap-3 items-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                      <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">💵 Payday!</p>
                    </div>
                  )}
                  {dayBills.map((b, i) => (
                    <div key={i} className="flex gap-3 items-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300 truncate">{b.name}</p>
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(b.amount)} due</p>
                      </div>
                    </div>
                  ))}
                  {dayEvents.map((e, i) => (
                    <div key={e.id ?? i} className="flex gap-3 items-start p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                      <div className="w-1 rounded-full self-stretch shrink-0 mt-0.5" style={{ backgroundColor: e.color ?? "#4285f4" }} />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium leading-snug">{e.title}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            {e.htmlLink && (
                              <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {e.source === "local" && e.localId && (
                              <button onClick={() => handleDeleteLocalEvent(e.localId!, e.title)} className="text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
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
              )
            })()}
          </Card>
      </div>

      {/* Upcoming strip */}
      {(() => {
        const now = new Date()
        const calUpcoming = visibleEvents
          .filter((e) => e.start && parseISO(e.start) >= now)
          .map((e) => ({ type: "event" as const, title: e.title, date: e.start!, color: e.color ?? "#4285f4", allDay: e.allDay }))

        const billUpcoming = showBills ? billEvents
          .filter((b) => b.nextDate >= format(now, "yyyy-MM-dd"))
          .map((b) => ({ type: "bill" as const, title: b.name, date: b.nextDate + "T12:00:00", color: "#f59e0b", allDay: true, amount: b.amount }))
          : []

        const paydayUpcoming = showPayday ? paydayEvents
          .filter((p) => p.date >= format(now, "yyyy-MM-dd"))
          .map((p) => ({ type: "payday" as const, title: "💵 Payday", date: p.date + "T12:00:00", color: "#10b981", allDay: true }))
          : []

        const all = [...calUpcoming, ...billUpcoming, ...paydayUpcoming]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 8)

        if (!all.length) return null
        return (
          <Card className="p-4 sm:p-6">
            <p className="font-semibold text-sm mb-3">Upcoming</p>
            <div className="space-y-2">
              {all.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="font-medium truncate flex-1">{item.title}{"amount" in item ? ` — ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.amount)}` : ""}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(item.date), item.allDay ? "MMM d" : "MMM d, h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )
      })()}

      {/* Add Event dialog */}
      <Dialog open={addEventOpen} onOpenChange={(o) => { if (!o) { setAddEventOpen(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="Event name" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} autoFocus />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allday"
                checked={evAllDay}
                onChange={(e) => setEvAllDay(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="allday" className="cursor-pointer font-normal">All day</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label>Date</Label>
                <Input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
              </div>
              {!evAllDay && (
                <>
                  <div className="space-y-1.5">
                    <Label>Start time</Label>
                    <Input type="time" value={evStartTime} onChange={(e) => setEvStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End time</Label>
                    <Input type="time" value={evEndTime} onChange={(e) => setEvEndTime(e.target.value)} />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="Add location" value={evLocation} onChange={(e) => setEvLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="Add notes" value={evNotes} onChange={(e) => setEvNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEvColor(c)}
                    className={`w-6 h-6 rounded-full transition-all ${evColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleAddEvent} disabled={savingEvent || !evTitle.trim() || !evDate}>
              {savingEvent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {savingEvent ? "Saving…" : "Save Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
