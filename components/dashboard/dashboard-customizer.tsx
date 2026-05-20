"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SlidersHorizontal, Check } from "lucide-react"

export const DASHBOARD_SECTIONS = [
  { key: "stats", label: "Stats Cards" },
  { key: "tasks", label: "Task Board" },
  { key: "budget_health", label: "Budget Health" },
  { key: "recent_transactions", label: "Recent Transactions" },
  { key: "goals", label: "Savings Goals" },
  { key: "bill_reminders", label: "Bill Reminders" },
  { key: "insights", label: "AI Spending Insights" },
] as const

export type SectionKey = typeof DASHBOARD_SECTIONS[number]["key"]

const STORAGE_KEY = "dashboard_sections"

export function useDashboardSections() {
  const [hidden, setHidden] = useState<Set<SectionKey>>(new Set())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setHidden(new Set(JSON.parse(stored)))
    } catch {}
    setMounted(true)
  }, [])

  function toggle(key: SectionKey) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function isVisible(key: SectionKey) {
    return mounted ? !hidden.has(key) : true
  }

  return { hidden, toggle, isVisible, mounted }
}

export function DashboardCustomizer() {
  const [open, setOpen] = useState(false)
  const { hidden, toggle, isVisible } = useDashboardSections()

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-transparent text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Customize
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Customize Dashboard</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Choose which sections to show</p>
          <div className="space-y-1 mt-1">
            {DASHBOARD_SECTIONS.map((section) => {
              const visible = isVisible(section.key)
              return (
                <button
                  key={section.key}
                  onClick={() => toggle(section.key)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left ${
                    visible
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/20"
                  }`}
                >
                  <span className="text-sm font-medium">{section.label}</span>
                  {visible && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
