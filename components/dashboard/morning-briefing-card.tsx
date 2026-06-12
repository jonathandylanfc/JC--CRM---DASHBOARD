"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { ChevronDown, ChevronRight, Sun, X } from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"

interface Props {
  briefing: { content: string; created_at: string } | null
}

const DISMISS_KEY = "briefing_dismissed_date"
const HIDE_AFTER_HOUR = 7 // 7 AM local time

export function MorningBriefingCard({ briefing }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString("en-CA")
    const dismissedDate = localStorage.getItem(DISMISS_KEY)
    if (dismissedDate === todayStr) setDismissed(true)
    setMounted(true)
  }, [])

  if (!briefing) return null

  // Auto-hide after 7 AM
  const now = new Date()
  const isPastHideTime = now.getHours() >= HIDE_AFTER_HOUR

  // Don't render until mounted (avoids SSR mismatch)
  if (!mounted) return null
  if (dismissed || isPastHideTime) return null

  const date = new Date(briefing.created_at)
  const dateLabel = isToday(date)
    ? `Today at ${format(date, "h:mm a")}`
    : isYesterday(date)
    ? `Yesterday at ${format(date, "h:mm a")}`
    : format(date, "MMM d 'at' h:mm a")

  function dismiss() {
    const todayStr = new Date().toLocaleDateString("en-CA")
    localStorage.setItem(DISMISS_KEY, todayStr)
    setDismissed(true)
  }

  return (
    <Card className="p-4 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left"
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
        <button
          type="button"
          onClick={dismiss}
          className="ml-1 p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-muted-foreground hover:text-foreground transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

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
