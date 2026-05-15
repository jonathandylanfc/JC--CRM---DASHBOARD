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
  Upload,
  Check,
  X,
  Send,
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

  // Schedule upload
  const [scheduleUploadOpen, setScheduleUploadOpen] = useState(false)
  const [scheduleImage, setScheduleImage] = useState<File | null>(null)
  const [schedulePreview, setSchedulePreview] = useState<string | null>(null)
  const [parsedShifts, setParsedShifts] = useState<Array<{
    title: string; date: string; start_time?: string; end_time?: string; notes?: string; selected: boolean
  }>>([])
  const [parsing, setParsing] = useState(false)
  const [addingShifts, setAddingShifts] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("local")

  function handleScheduleFile(file: File) {
    setScheduleImage(file)
    setSchedulePreview(URL.createObjectURL(file))
    setParsedShifts([])
    setParseError(null)
  }

  async function handleParseSchedule() {
    if (!scheduleImage) return
    setParsing(true)
    setParseError(null)
    try {
      const fd = new FormData()
      fd.append("image", scheduleImage)
      const res = await fetch("/api/calendar/parse-schedule", { method: "POST", body: fd })
      const data = await res.json()
      if (data.error) { setParseError(data.error); return }
      if (!data.events?.length) { setParseError("No shifts found in this image. Try a clearer screenshot."); return }
      setParsedShifts(data.events.map((e: { title: string; date: string; start_time?: string; end_time?: string; notes?: string }) => ({ ...e, selected: true })))
      // Auto-select primary Google Calendar if connected
      const primary = calendarSources.find((c) => c.source === "google" && c.name === "JC")
        ?? calendarSources.find((c) => c.source === "google")
      if (primary?.id) setSelectedCalendarId(primary.id)
    } finally {
      setParsing(false)
    }
  }

  async function handleAddShifts() {
    const toAdd = parsedShifts.filter((s) => s.selected)
    if (!toAdd.length) return
    setAddingShifts(true)
    try {
      if (selectedCalendarId !== "local") {
        // Add to the chosen Google Calendar
        const res = await fetch("/api/calendar/add-shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shifts: toAdd, calendarId: selectedCalendarId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        })
        const data = await res.json()
        if (data.error) { toast.error(data.error); return }
        const calName = calendarSources.find((c) => c.id === selectedCalendarId)?.name ?? "Google Calendar"
        toast.success(`Added ${toAdd.length} shift${toAdd.length !== 1 ? "s" : ""} to ${calName} — syncing to your phone!`)
      } else {
        // Save to local (app-only) storage
        for (const shift of toAdd) {
          const startAt = shift.start_time ? `${shift.date}T${shift.start_time}:00` : `${shift.date}T00:00:00`
          const endAt = shift.end_time ? `${shift.date}T${shift.end_time}:00` : null
          await fetch("/api/calendar/local-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: shift.title,
              start_at: startAt,
              end_at: endAt,
              all_day: !shift.start_time,
              location: null,
              notes: shift.notes || null,
              color: "#f97316",
            }),
          })
        }
        toast.success(`Added ${toAdd.length} shift${toAdd.length !== 1 ? "s" : ""} to this app's calendar!`)
      }
      setScheduleUploadOpen(false)
      setScheduleImage(null)
      setSchedulePreview(null)
      setParsedShifts([])
      fetchAll(true)
    } finally {
      setAddingShifts(false)
    }
  }

  // Send local event to Google Calendar
  const [sendToGoogleEvent, setSendToGoogleEvent] = useState<CalEvent | null>(null)
  const [sendToGoogleCalId, setSendToGoogleCalId] = useState<string>("primary")
  const [sendingToGoogle, setSendingToGoogle] = useState(false)

  async function handleSendToGoogle() {
    if (!sendToGoogleEvent) return
    setSendingToGoogle(true)
    try {
      const e = sendToGoogleEvent
      const dateStr = e.start ? e.start.slice(0, 10) : format(selectedDay, "yyyy-MM-dd")
      const startTime = e.start && !e.allDay ? e.start.slice(11, 16) : undefined
      const endTime = e.end && !e.allDay ? e.end.slice(11, 16) : undefined
      const res = await fetch("/api/calendar/add-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: sendToGoogleCalId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          shifts: [{ title: e.title, date: dateStr, start_time: startTime, end_time: endTime, notes: e.description || undefined }],
        }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      const calName = calendarSources.find((c) => c.id === sendToGoogleCalId)?.name ?? "Google Calendar"
      toast.success(`"${e.title}" sent to ${calName} — syncing to your phone!`)
      setSendToGoogleEvent(null)
      fetchAll(true)
    } finally {
      setSendingToGoogle(false)
    }
  }

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

      // Always load local + ICS events regardless of Google connection
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

      const icsCalSources: CalendarSource[] = icsSubsList.map((s) => ({
        id: `ics-${s.id}`,
        name: s.name,
        color: s.color,
        source: "ics" as const,
        icsId: s.id,
      }))

      if (gData.error === "not_connected") {
        setConnected(false)
        setCalendarSources([...icsCalSources])
        setEvents([...icsEvents, ...localEvents])
      } else if (gData.events) {
        setConnected(true)
        setGoogleEmail(gData.googleEmail ?? null)
        const googleSources = (gData.calendarSources ?? []) as CalendarSource[]
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

  // No gate — calendar always shows. Google banner shown inline if not connected.

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Google Calendar connect banner (shown only when not connected) */}
      {!connected && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>Connect Google Calendar to sync your events</span>
          </div>
          <a href="/api/calendar/auth">
            <Button size="sm" variant="outline" className="gap-2 shrink-0 bg-transparent">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google
            </Button>
          </a>
        </div>
      )}

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
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setScheduleUploadOpen(true); setScheduleImage(null); setSchedulePreview(null); setParsedShifts([]); setParseError(null) }}>
            <Upload className="w-3.5 h-3.5" /> Upload Schedule
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setAddCalOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Calendar
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => fetchAll(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          {connected && (
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting} title="Disconnect Google Calendar">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
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
                              <>
                                {connected && (
                                  <button
                                    title="Send to Google Calendar"
                                    onClick={() => { setSendToGoogleEvent(e); setSendToGoogleCalId(calendarSources.find((c) => c.source === "google")?.id ?? "primary") }}
                                    className="text-muted-foreground hover:text-blue-500 transition-colors"
                                  >
                                    <Send className="w-3 h-3" />
                                  </button>
                                )}
                                <button onClick={() => handleDeleteLocalEvent(e.localId!, e.title)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
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

      {/* Send to Google Calendar dialog */}
      <Dialog open={!!sendToGoogleEvent} onOpenChange={(o) => { if (!o) setSendToGoogleEvent(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4" /> Send to Google Calendar
            </DialogTitle>
          </DialogHeader>
          {sendToGoogleEvent && (
            <div className="space-y-4 mt-1">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium">{sendToGoogleEvent.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatEventTime(sendToGoogleEvent)}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Choose calendar:</Label>
                <div className="flex flex-col gap-1.5">
                  {calendarSources.filter((c) => c.source === "google").map((cal) => (
                    <button
                      key={cal.id}
                      onClick={() => setSendToGoogleCalId(cal.id ?? "primary")}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                        sendToGoogleCalId === cal.id
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                      <span className="flex-1 truncate">{cal.name}</span>
                      {sendToGoogleCalId === cal.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setSendToGoogleEvent(null)}>Cancel</Button>
                <Button className="flex-1 gap-2" onClick={handleSendToGoogle} disabled={sendingToGoogle}>
                  {sendingToGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingToGoogle ? "Sending…" : "Send to Google"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Upload Schedule dialog */}
      <Dialog open={scheduleUploadOpen} onOpenChange={(o) => { if (!o) setScheduleUploadOpen(false) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Import Work Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Drop zone */}
            {!schedulePreview ? (
              <label
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleScheduleFile(f) }}
              >
                <Upload className="w-8 h-8 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium">Drop your schedule screenshot here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse · PNG, JPG, HEIC</p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScheduleFile(f) }} />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border border-border max-h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={schedulePreview} alt="Schedule preview" className="w-full object-contain max-h-48" />
                  <button
                    onClick={() => { setScheduleImage(null); setSchedulePreview(null); setParsedShifts([]); setParseError(null) }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {parsedShifts.length === 0 && !parsing && (
                  <Button className="w-full gap-2" onClick={handleParseSchedule}>
                    <Upload className="w-4 h-4" /> Parse Schedule with AI
                  </Button>
                )}

                {parsing && (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reading your schedule…
                  </div>
                )}

                {parseError && (
                  <p className="text-sm text-destructive text-center">{parseError}</p>
                )}

                {parsedShifts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Found {parsedShifts.length} shift{parsedShifts.length !== 1 ? "s" : ""}</p>
                      <button
                        onClick={() => setParsedShifts((prev) => prev.map((s) => ({ ...s, selected: !prev.every((x) => x.selected) })))}
                        className="text-xs text-primary underline underline-offset-2"
                      >
                        {parsedShifts.every((s) => s.selected) ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {parsedShifts.map((shift, i) => (
                        <button
                          key={i}
                          onClick={() => setParsedShifts((prev) => prev.map((s, j) => j === i ? { ...s, selected: !s.selected } : s))}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                            shift.selected ? "border-primary/40 bg-primary/5" : "border-border opacity-50"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${shift.selected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                            {shift.selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{shift.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(shift.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              {shift.start_time && ` · ${shift.start_time}${shift.end_time ? ` – ${shift.end_time}` : ""}`}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Calendar destination picker */}
                    <div className="space-y-1.5 pt-1 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Add to calendar:</p>
                      <div className="flex flex-col gap-1.5">
                        {calendarSources.filter((c) => c.source === "google").map((cal) => (
                          <button
                            key={cal.id}
                            onClick={() => setSelectedCalendarId(cal.id ?? "local")}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                              selectedCalendarId === cal.id
                                ? "border-primary bg-primary/5 font-medium"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                            <span className="flex-1 truncate">{cal.name}</span>
                            {selectedCalendarId === cal.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                        <button
                          onClick={() => setSelectedCalendarId("local")}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                            selectedCalendarId === "local"
                              ? "border-primary bg-primary/5 font-medium"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground shrink-0" />
                          <span className="flex-1">This app only (not synced to phone)</span>
                          {selectedCalendarId === "local" && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      className="w-full gap-2"
                      onClick={handleAddShifts}
                      disabled={addingShifts || parsedShifts.every((s) => !s.selected)}
                    >
                      {addingShifts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {addingShifts ? "Adding…" : `Add ${parsedShifts.filter((s) => s.selected).length} Shift${parsedShifts.filter((s) => s.selected).length !== 1 ? "s" : ""} to Calendar`}
                    </Button>
                  </div>
                )}
              </div>
            )}
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
