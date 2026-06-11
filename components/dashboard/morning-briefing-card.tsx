"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ChevronDown, ChevronRight, Sun } from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"

interface Props {
  briefing: { content: string; created_at: string } | null
}

export function MorningBriefingCard({ briefing }: Props) {
  const [expanded, setExpanded] = useState(true)

  if (!briefing) return null

  const date = new Date(briefing.created_at)
  const dateLabel = isToday(date)
    ? `Today at ${format(date, "h:mm a")}`
    : isYesterday(date)
    ? `Yesterday at ${format(date, "h:mm a")}`
    : format(date, "MMM d 'at' h:mm a")

  return (
    <Card className="p-4 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Sun className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="font-semibold text-foreground flex-1">Morning Briefing</span>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
            {briefing.content}
          </pre>
        </div>
      )}
    </Card>
  )
}
