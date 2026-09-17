"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { CalendarDays, AlertTriangle, Mic, TrendingUp, ExternalLink } from "lucide-react"

type EventType = "fomc" | "cpi" | "nfp" | "pce" | "fed_speak" | "earnings"

interface CalendarEvent {
  date: string          // YYYY-MM-DD
  label: string
  type: EventType
  note?: string | null
  symbol?: string       // for earnings events
}

const TYPE_META: Record<EventType, { color: string; bg: string; border: string; dot: string; abbr: string }> = {
  fomc:      { color: "text-amber-700 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/30",   border: "border-amber-200 dark:border-amber-800",   dot: "bg-amber-500",   abbr: "FOMC" },
  cpi:       { color: "text-blue-700 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30",     border: "border-blue-200 dark:border-blue-800",     dot: "bg-blue-500",    abbr: "CPI"  },
  nfp:       { color: "text-sky-700 dark:text-sky-400",       bg: "bg-sky-50 dark:bg-sky-950/30",       border: "border-sky-200 dark:border-sky-800",       dot: "bg-sky-500",     abbr: "NFP"  },
  pce:       { color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-800", dot: "bg-indigo-500",  abbr: "PCE"  },
  fed_speak: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800", dot: "bg-orange-500",  abbr: "FED"  },
  earnings:  { color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", dot: "bg-violet-500",  abbr: "ERN"  },
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + "T00:00:00")
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function DaysBadge({ days }: { days: number }) {
  if (days === 0) return <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">Today</span>
  if (days === 1) return <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Tomorrow</span>
  if (days <= 7) return <span className="text-[10px] text-amber-600 dark:text-amber-400">{days}d</span>
  return <span className="text-[10px] text-muted-foreground">{days}d</span>
}

export function EconomicCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState<"upcoming" | "all">("upcoming")

  useEffect(() => {
    fetch("/api/market/calendar", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const macro: CalendarEvent[] = (data.macro ?? []).map((e: CalendarEvent) => ({
          date: e.date, label: e.label, type: e.type, note: e.note ?? null,
        }))
        const earnings: CalendarEvent[] = (data.earnings ?? []).map((e: { symbol: string; name: string | null; date: string }) => ({
          date: e.date,
          label: e.symbol === "NVDA" ? `${e.symbol} Earnings ⚡` : `${e.symbol} Earnings`,
          type: "earnings" as EventType,
          note: e.name ?? e.symbol,
          symbol: e.symbol,
        }))

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const all = [...macro, ...earnings]
          .filter((e) => new Date(e.date + "T00:00:00") >= today)
          .sort((a, b) => a.date.localeCompare(b.date))

        setEvents(all)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = show === "upcoming" ? events.slice(0, 6) : events

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Economic Calendar</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            Fed calendar <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4">
        {(["fomc", "cpi", "nfp", "pce", "earnings"] as EventType[]).map((t) => (
          <div key={t} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${TYPE_META[t].dot}`} />
            <span className="text-[10px] text-muted-foreground font-medium">{TYPE_META[t].abbr}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No upcoming events found</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((ev, i) => {
            const days = daysUntil(ev.date)
            const meta = TYPE_META[ev.type]
            const isUrgent = days <= 3
            return (
              <div
                key={`${ev.date}-${ev.label}-${i}`}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${meta.bg} ${meta.border} ${isUrgent ? "ring-1 ring-inset ring-current/20" : ""}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold truncate ${meta.color}`}>{ev.label}</span>
                    {ev.type === "fomc" && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                    {ev.type === "earnings" && ev.symbol === "NVDA" && <TrendingUp className="w-3 h-3 text-violet-500 flex-shrink-0" />}
                  </div>
                  {ev.note && (
                    <p className="text-[10px] text-muted-foreground truncate">{ev.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">{fmtDate(ev.date)}</span>
                  <DaysBadge days={days} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Show more / less */}
      {!loading && events.length > 6 && (
        <button
          onClick={() => setShow(show === "upcoming" ? "all" : "upcoming")}
          className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
        >
          {show === "upcoming" ? `Show all ${events.length} events` : "Show fewer"}
        </button>
      )}

      {/* Pre-market / futures note */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-start gap-1.5">
          <Mic className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Fed speak:</span> Watch MNQ pre-market futures for overnight reactions to any of the above. FOMC & NVDA earnings are the highest-volatility events for MNQ. Check{" "}
            <a
              href="https://www.forexfactory.com/calendar"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Forex Factory
            </a>
            {" "}for Fed member speech schedule.
          </p>
        </div>
      </div>
    </Card>
  )
}
