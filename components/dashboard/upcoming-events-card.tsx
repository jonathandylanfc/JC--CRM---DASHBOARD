"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ChevronDown, ChevronRight, CalendarDays } from "lucide-react"
import { format, isToday, isTomorrow } from "date-fns"
import Link from "next/link"

interface Event {
  id: string
  title: string
  start_at: string
  all_day: boolean
  color: string
}

interface Props {
  events: Event[]
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  return format(d, "EEE, MMM d")
}

export function UpcomingEventsCard({ events }: Props) {
  const [expanded, setExpanded] = useState(true)

  if (events.length === 0) return null

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-foreground flex-1">Upcoming Events</span>
        <Link
          href="/calendar"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline mr-2"
        >
          View all
        </Link>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? "#6366f1" }} />
              <span className="font-medium flex-1 truncate">{e.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {dayLabel(e.start_at)}{!e.all_day && ` · ${format(new Date(e.start_at), "h:mm a")}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
