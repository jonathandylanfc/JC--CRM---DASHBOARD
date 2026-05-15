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
  const [addCalTab, setAddCalTab] = useState<"ics" | "icloud">("ics")
  const [icsName, setIcsName] = useState("")
  const [icsUrl, setIcsUrl] = useState("")
  const [icsColor, setIcsColor] = useState(COLOR_OPTIONS[0])
  const [addingIcs, setAddingIcs] = useState(false)

  // iCloud CalDAV
  const [icloudConnected, setIcloudConnected] = useState(false)
  const [icloudEmail, setIcloudEmail] = useState<string | null>(null)
  const [icloudCalendars, setIcloudCalendars] = useState<Array<{ url: string; displayName: string; color: string }>>([])
  const [icloudAppleId, setIcloudAppleId] = useState("")
  const [icloudAppPassword, setIcloudAppPassword] = useState("")
  const [connectingIcloud, setConnectingIcloud] = useState(false)
  const [icloudError, setIcloudError] = useState<string | null>(null)

  // Finance events (payday)
  const [paydayDay, setPaydayDay] = useState<number | null>(null)
  const [paydayType, setPaydayType] = useState<"monthly" | "biweekly">("monthly")
  const [paydayStartDate, setPaydayStartDate] = useState<string | null>(null)
  const [paydayEvents, setPaydayEvents] = useState<Array<{ date: string }>>([])
  const [showPayday, setShowPayday] = useState(true)
  const [paydayDialogOpen, setPaydayDialogOpen] = useState(false)
  const [paydayInput, setPaydayInput] = useState("")
  const [paydayTypeInput, setPaydayTypeInput] = useState<"monthly" | "biweekly">("monthly")
  const [paydayStartInput, setPaydayStartInput] = useState("")
  const [paydayCalendarId, setPaydayCalendarId] = useState<string>("none")
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
      if (selectedCalendarId.startsWith("icloud:")) {
        // Add to iCloud calendar
        const calendarUrl = selectedCalendarId.replace("icloud:", "")
        const calName = icloudCalendars.find((c) => c.url === calendarUrl)?.displayName ?? "iCloud Calendar"
        let successCount = 0
        for (const shift of toAdd) {
          try {
            await handleAddToIcloud(calendarUrl, shift)
            successCount++
          } catch (err) {
            toast.error(`Failed to add "${shift.title}" to iCloud: ${err instanceof Error ? err.message : "Unknown error"}`)
          }
        }
        if (successCount > 0) toast.success(`Added ${successCount} shift${successCount !== 1 ? "s" : ""} to ${calName}!`)
      } else if (selectedCalendarId !== "local") {
        // Add to the chosen Google Calendar
        const res = await fetch("/api/calendar/add-shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shifts: toAdd, calendarId: selectedCalendarId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        })
        const data = await res.json()
        if (data.error) { toast.error(data.error); return }
        const created: string[] = data.created ?? []
        const failed: string[] = data.errors ?? []
        const calName = calendarSources.find((c) => c.id === selectedCalendarId)?.name ?? "Google Calendar"
        if (created.length > 0) {
          toast.success(`Added ${created.length} shift${created.length !== 1 ? "s" : ""} to ${calName} — syncing to your phone!`)
        }
        if (failed.length > 0) {
          toast.error(`Failed to add ${failed.length} shift${failed.length !== 1 ? "s" : ""}: ${failed.join(", ")}. Try reconnecting Google Calendar.`)
        }
        if (created.length === 0 && failed.length === 0) {
          toast.error("No shifts were added. Try reconnecting Google Calendar.")
        }
        if (created.length === 0) return
      } else {
        // Save to local (app-only) storage
        for (const shift of toAdd) {
          const startAt = new Date(`${shift.date}T${shift.start_time || "12:00"}:00`).toISOString()
          const endAt = shift.end_time ? new Date(`${shift.date}T${shift.end_time}:00`).toISOString() : null
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
      if (data.errors?.length > 0) {
        toast.error(`Failed to send "${e.title}" to Google Calendar. Try reconnecting.`)
        return
      }
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

  async function handleConnectIcloud() {
    if (!icloudAppleId || !icloudAppPassword) return
    setConnectingIcloud(true)
    setIcloudError(null)
    try {
      const res = await fetch("/api/calendar/caldav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", appleId: icloudAppleId, appPassword: icloudAppPassword }),
      })
      const data = await res.json()
      if (data.error) { setIcloudError(data.error); return }
      toast.success("iCloud Calendar connected!")
      setAddCalOpen(false)
      setIcloudAppleId("")
      setIcloudAppPassword("")
      fetchAll(true)
    } finally {
      setConnectingIcloud(false)
    }
  }

  async function handleDisconnectIcloud() {
    await fetch("/api/calendar/caldav", { method: "DELETE" })
    setIcloudConnected(false)
    setIcloudEmail(null)
    setIcloudCalendars([])
    toast.success("iCloud Calendar disconnected")
  }

  async function handleAddToIcloud(calendarUrl: string, shift: { title: string; date: string; start_time?: string; end_time?: string; notes?: string }) {
    const res = await fetch("/api/calendar/caldav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add-event",
        calendarUrl,
        title: shift.title,
        date: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        notes: shift.notes,
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
  }

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [gRes, icsRes, localRes, finRes, caldavRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/calendar/ics"),
        fetch("/api/calendar/local-events"),
        fetch("/api/calendar/finance-events"),
        fetch("/api/calendar/caldav"),
      ])
      const gData = await gRes.json()
      const icsData = await icsRes.json()
      const localData = await localRes.json()
      const finData = await finRes.json()
      const caldavData = await caldavRes.json()

      // iCloud CalDAV
      setIcloudConnected(caldavData.connected ?? false)
      setIcloudEmail(caldavData.appleId ?? null)
      setIcloudCalendars(caldavData.calendars ?? [])

      // Finance events
      setPaydayDay(finData.paydayDay ?? null)
      setPaydayType(finData.paydayType ?? "monthly")
      setPaydayStartDate(finData.paydayStartDate ?? null)
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
      // Use local time → UTC conversion so dates don't shift across timezones
      const startAt = new Date(`${evDate}T${evAllDay ? "12:00" : (evStartTime || "12:00")}:00`).toISOString()
      const endAt = (!evAllDay && evEndTime) ? new Date(`${evDate}T${evEndTime}:00`).toISOString() : null
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
    if (showPayday && paydayEvents.some((p) => p.date === dayStr)) colors.push("#10b981")
    return colors.slice(0, 4)
  }

  async function handleSavePayday() {
    if (paydayTypeInput === "monthly") {
      if (!paydayInput) return
      const day = parseInt(paydayInput)
      if (isNaN(day) || day < 1 || day > 31) return
    } else {
      if (!paydayStartInput) return
    }
    setSavingPayday(true)
    try {
      await fetch("/api/calendar/finance-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payday_type: paydayTypeInput,
          payday_day: paydayTypeInput === "monthly" ? parseInt(paydayInput) : null,
          payday_start_date: paydayTypeInput === "biweekly" ? paydayStartInput : null,
        }),
      })

      // Push payday events to chosen external calendar
      if (paydayCalendarId !== "none") {
        // Build upcoming payday dates (next 3 months)
        const upcoming: string[] = []
        const today = new Date(); today.setHours(0,0,0,0)
        if (paydayTypeInput === "biweekly" && paydayStartInput) {
          let cursor = new Date(paydayStartInput + "T12:00:00")
          while (cursor > today) cursor = new Date(cursor.getTime() - 14 * 86400000)
          const end = new Date(today); end.setMonth(end.getMonth() + 3)
          while (cursor <= end) {
            if (cursor >= today) upcoming.push(cursor.toISOString().slice(0, 10))
            cursor = new Date(cursor.getTime() + 14 * 86400000)
          }
        } else if (paydayTypeInput === "monthly" && paydayInput) {
          const day = parseInt(paydayInput)
          for (let i = 0; i < 3; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, Math.min(day, new Date(today.getFullYear(), today.getMonth() + i + 1, 0).getDate()))
            upcoming.push(d.toISOString().slice(0, 10))
          }
        }

        const shifts = upcoming.map((date) => ({ title: "💵 Payday", date, notes: "Added by JDpro" }))

        if (paydayCalendarId.startsWith("icloud:")) {
          const calendarUrl = paydayCalendarId.replace("icloud:", "")
          for (const shift of shifts) {
            await fetch("/api/calendar/caldav", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "add-event", calendarUrl, title: shift.title, date: shift.date, notes: shift.notes }),
            })
          }
          toast.success(`Payday saved & ${shifts.length} dates added to iCloud!`)
        } else {
          const res = await fetch("/api/calendar/add-shifts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shifts, calendarId: paydayCalendarId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
          })
          const data = await res.json()
          const count = data.created?.length ?? 0
          toast.success(`Payday saved & ${count} dates added to Google Calendar!`)
        }
      } else {
        toast.success("Payday saved!")
      }

      setPaydayDialogOpen(false)
      fetchAll(true)
    } finally {
      setSavingPayday(false)
    }
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
        </div>
      </div>

      {/* My Calendars — inline pill row */}
      {(calendarSources.length > 0 || icloudConnected) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">My Calendars:</span>

          {/* Google account pill */}
          {connected && googleEmail && (
            <div className="flex items-center gap-1 group">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-blue-400/40 bg-blue-400/10">
                <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>{googleEmail}</span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                title="Disconnect Google Calendar"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive -ml-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* iCloud account pill */}
          {icloudConnected && icloudEmail && (
            <div className="flex items-center gap-1 group">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-sky-400/40 bg-sky-400/10">
                <span>🍎</span>
                <span>{icloudEmail}</span>
              </div>
              <button
                onClick={handleDisconnectIcloud}
                title="Disconnect iCloud Calendar"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive -ml-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Individual calendars (Google sub-calendars + ICS) */}
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
          onClick={() => setShowPayday((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showPayday ? "border-emerald-400/60 bg-emerald-400/10 text-foreground" : "border-border text-muted-foreground opacity-50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" style={{ opacity: showPayday ? 1 : 0.4 }} />
          <span className={showPayday ? "" : "line-through"}>Payday</span>
        </button>
        <button
          onClick={() => {
            setPaydayTypeInput(paydayType)
            setPaydayInput(paydayDay ? String(paydayDay) : "")
            setPaydayStartInput(paydayStartDate ?? "")
            setPaydayCalendarId("none")
            setPaydayDialogOpen(true)
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
        >
          <Settings className="w-3 h-3" />
          {paydayType === "biweekly" && paydayStartDate
            ? "Payday: Every 2 weeks"
            : paydayDay
            ? `Payday: ${paydayDay}${["st","nd","rd"][((paydayDay % 10)-1)] ?? "th"}`
            : "Set Payday"}
        </button>
      </div>

      {/* Payday dialog */}
      <Dialog open={paydayDialogOpen} onOpenChange={(o) => { if (!o) setPaydayDialogOpen(false) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Set Payday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Frequency toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setPaydayTypeInput("monthly")}
                className={`flex-1 text-sm py-1.5 rounded-md transition-all ${paydayTypeInput === "monthly" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setPaydayTypeInput("biweekly")}
                className={`flex-1 text-sm py-1.5 rounded-md transition-all ${paydayTypeInput === "biweekly" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Every 2 weeks
              </button>
            </div>

            {paydayTypeInput === "monthly" ? (
              <div className="space-y-1.5">
                <Label htmlFor="payday-day">Day of month (1–31)</Label>
                <Input id="payday-day" type="number" min="1" max="31" placeholder="e.g. 15" value={paydayInput} onChange={(e) => setPaydayInput(e.target.value)} autoFocus />
                <p className="text-xs text-muted-foreground">Payday appears on this day every month.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="payday-start">Most recent payday date</Label>
                <Input id="payday-start" type="date" value={paydayStartInput} onChange={(e) => setPaydayStartInput(e.target.value)} />
                <p className="text-xs text-muted-foreground">Pick your last payday — the app will calculate every 2 weeks from there.</p>
              </div>
            )}

            {/* Calendar destination */}
            {(calendarSources.some((c) => c.source === "google") || icloudCalendars.length > 0) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Also add to calendar (optional)</Label>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                  <button
                    onClick={() => setPaydayCalendarId("none")}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${paydayCalendarId === "none" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground shrink-0" />
                    <span className="flex-1">Don&apos;t add to external calendar</span>
                    {paydayCalendarId === "none" && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                  {calendarSources.filter((c) => c.source === "google").map((cal) => (
                    <button
                      key={cal.id}
                      onClick={() => setPaydayCalendarId(cal.id ?? "primary")}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${paydayCalendarId === cal.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                      <span className="flex-1 truncate">{cal.name}</span>
                      <span className="text-[10px] text-muted-foreground">Google</span>
                      {paydayCalendarId === cal.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  ))}
                  {icloudCalendars.map((cal) => (
                    <button
                      key={cal.url}
                      onClick={() => setPaydayCalendarId(`icloud:${cal.url}`)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${paydayCalendarId === `icloud:${cal.url}` ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                      <span className="flex-1 truncate">{cal.displayName}</span>
                      <span className="text-[10px] text-muted-foreground">iCloud</span>
                      {paydayCalendarId === `icloud:${cal.url}` && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setPaydayDialogOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={handleSavePayday}
                disabled={savingPayday || (paydayTypeInput === "monthly" ? !paydayInput : !paydayStartInput)}
              >
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
              const isPayday = showPayday && paydayEvents.some((p) => p.date === dayStr)
              const hasExtra = isPayday
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

        const paydayUpcoming = showPayday ? paydayEvents
          .filter((p) => p.date >= format(now, "yyyy-MM-dd"))
          .map((p) => ({ type: "payday" as const, title: "💵 Payday", date: p.date + "T12:00:00", color: "#10b981", allDay: true }))
          : []

        const all = [...calUpcoming, ...paydayUpcoming]
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
                        {icloudCalendars.map((cal) => (
                          <button
                            key={cal.url}
                            onClick={() => setSelectedCalendarId(`icloud:${cal.url}`)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                              selectedCalendarId === `icloud:${cal.url}`
                                ? "border-primary bg-primary/5 font-medium"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                            <span className="flex-1 truncate">{cal.displayName}</span>
                            <span className="text-[10px] text-muted-foreground">iCloud</span>
                            {selectedCalendarId === `icloud:${cal.url}` && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
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
      <Dialog open={addCalOpen} onOpenChange={(o) => { setAddCalOpen(o); if (!o) { setIcloudError(null); setAddCalTab("ics") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Calendar</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setAddCalTab("icloud")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-all ${addCalTab === "icloud" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              🍎 iCloud
            </button>
            <button
              onClick={() => setAddCalTab("ics")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-all ${addCalTab === "ics" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              📅 ICS Link
            </button>
          </div>

          {addCalTab === "icloud" ? (
            <div className="space-y-4 mt-1">
              {icloudConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div>
                      <p className="text-sm font-medium">Connected</p>
                      <p className="text-xs text-muted-foreground">{icloudEmail}</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive bg-transparent" onClick={handleDisconnectIcloud}>
                      Disconnect
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{icloudCalendars.length} calendar{icloudCalendars.length !== 1 ? "s" : ""} found. You can now add events directly to iCloud when uploading a schedule.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Connect your iCloud account to add events directly to Apple Calendar.</p>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-1">⚠️ Use an App-Specific Password</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Do NOT use your main Apple ID password. Generate an app-specific password at <span className="font-medium">appleid.apple.com</span> → Sign-In and Security → App-Specific Passwords.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apple ID (email)</Label>
                    <Input placeholder="you@icloud.com" value={icloudAppleId} onChange={(e) => setIcloudAppleId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>App-Specific Password</Label>
                    <Input type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={icloudAppPassword} onChange={(e) => setIcloudAppPassword(e.target.value)} />
                  </div>
                  {icloudError && <p className="text-sm text-destructive">{icloudError}</p>}
                  <Button className="w-full" onClick={handleConnectIcloud} disabled={connectingIcloud || !icloudAppleId || !icloudAppPassword}>
                    {connectingIcloud ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {connectingIcloud ? "Connecting…" : "Connect iCloud"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 mt-1">
              <p className="text-sm text-muted-foreground -mt-1">
                Add any calendar with a public <span className="font-medium">.ics</span> link — subscribed calendars, sports schedules, etc.
              </p>
              <div className="space-y-1.5">
                <Label>Calendar name</Label>
                <Input placeholder="e.g. Work, NFL Schedule" value={icsName} onChange={(e) => setIcsName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Calendar URL (.ics link)</Label>
                <Input placeholder="webcal:// or https://..." value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} />
                <p className="text-xs text-muted-foreground">iCloud.com → Calendar → right-click → Share → Public Calendar → Copy Link</p>
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c} onClick={() => setIcsColor(c)} className={`w-6 h-6 rounded-full transition-all ${icsColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={handleAddIcs} disabled={addingIcs || !icsName.trim() || !icsUrl.trim()}>
                {addingIcs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {addingIcs ? "Verifying…" : "Add Calendar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
