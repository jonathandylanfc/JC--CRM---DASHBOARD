"use client"

import { useState, useEffect, useCallback, createContext, useContext } from "react"

// ─── Widget definitions ────────────────────────────────────────────────────────

export const WIDGET_DEFS = [
  { id: "stats",               label: "Stats Cards",           fixedFull: true  },
  { id: "tasks",               label: "Task Board",            fixedFull: false },
  { id: "budget_health",       label: "Budget Health",         fixedFull: false },
  { id: "recent_transactions", label: "Recent Transactions",   fixedFull: false },
  { id: "goals",               label: "Savings Goals",         fixedFull: false },
  { id: "bill_reminders",      label: "Bill Reminders",        fixedFull: false },
  { id: "weekly_recap",        label: "Weekly Recap",          fixedFull: false },
  { id: "insights",            label: "AI Spending Insights",  fixedFull: false },
] as const

export type WidgetId = typeof WIDGET_DEFS[number]["id"]
export type WidgetSize = "half" | "full"

export interface WidgetConfig {
  id: WidgetId
  size: WidgetSize
  visible: boolean
  order: number
}

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: "stats",               size: "full", visible: true,  order: 0 },
  { id: "tasks",               size: "half", visible: true,  order: 1 },
  { id: "budget_health",       size: "half", visible: true,  order: 2 },
  { id: "recent_transactions", size: "full", visible: true,  order: 3 },
  { id: "goals",               size: "half", visible: true,  order: 4 },
  { id: "bill_reminders",      size: "half", visible: true,  order: 5 },
  { id: "weekly_recap",        size: "half", visible: true,  order: 6 },
  { id: "insights",            size: "half", visible: true,  order: 7 },
]

const STORAGE_KEY = "dashboard_layout_v2"

// ─── Context ───────────────────────────────────────────────────────────────────

interface LayoutCtx {
  layout: WidgetConfig[]
  editMode: boolean
  setEditMode: (v: boolean) => void
  isVisible: (id: WidgetId) => boolean
  toggleVisible: (id: WidgetId) => void
  toggleSize: (id: WidgetId) => void
  reorder: (fromIdx: number, toIdx: number) => void
  mounted: boolean
}

const LayoutContext = createContext<LayoutCtx | null>(null)

export function DashboardLayoutProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayout] = useState<WidgetConfig[]>(DEFAULT_LAYOUT)
  const [editMode, setEditMode] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: WidgetConfig[] = JSON.parse(stored)
        // Merge with defaults to handle new widgets added after first visit
        const merged = DEFAULT_LAYOUT.map((def) => {
          const saved = parsed.find((p) => p.id === def.id)
          return saved ? { ...def, ...saved } : def
        })
        setLayout(merged)
      }
    } catch {}
    setMounted(true)
  }, [])

  const save = useCallback((next: WidgetConfig[]) => {
    setLayout(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }, [])

  const isVisible = (id: WidgetId) => mounted ? (layout.find((w) => w.id === id)?.visible ?? true) : true

  const toggleVisible = (id: WidgetId) => {
    save(layout.map((w) => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  const toggleSize = (id: WidgetId) => {
    save(layout.map((w) => w.id === id ? { ...w, size: w.size === "half" ? "full" : "half" } : w))
  }

  const reorder = (fromIdx: number, toIdx: number) => {
    const next = [...layout].sort((a, b) => a.order - b.order)
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    save(next.map((w, i) => ({ ...w, order: i })))
  }

  return (
    <LayoutContext.Provider value={{ layout, editMode, setEditMode, isVisible, toggleVisible, toggleSize, reorder, mounted }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useDashboardLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error("useDashboardLayout must be used within DashboardLayoutProvider")
  return ctx
}

// Keep backward compat for anything still using the old hook
export function useDashboardSections() {
  const { isVisible, mounted } = useDashboardLayout()
  return { isVisible, mounted, hidden: new Set<WidgetId>(), toggle: () => {} }
}

// ─── Floating edit button (rendered inside the page) ──────────────────────────

import { SlidersHorizontal, Check, X, GripVertical, Maximize2, Minimize2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DashboardEditButton() {
  const { editMode, setEditMode } = useDashboardLayout()

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:bottom-6">
      <Button
        onClick={() => setEditMode(!editMode)}
        size="sm"
        variant={editMode ? "default" : "outline"}
        className={`gap-2 shadow-lg px-5 rounded-full transition-all ${
          editMode
            ? "bg-primary text-primary-foreground"
            : "bg-card border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {editMode ? (
          <><Check className="w-3.5 h-3.5" /> Done</>
        ) : (
          <><SlidersHorizontal className="w-3.5 h-3.5" /> Edit Dashboard</>
        )}
      </Button>
    </div>
  )
}

// ─── Edit mode overlay for each widget ────────────────────────────────────────

interface WidgetWrapperProps {
  id: WidgetId
  index: number
  children: React.ReactNode
  className?: string
  onDragStart: (i: number) => void
  onDragOver: (i: number) => void
  onDrop: () => void
}

export function WidgetWrapper({ id, index, children, className = "", onDragStart, onDragOver, onDrop }: WidgetWrapperProps) {
  const { editMode, toggleSize, toggleVisible, layout } = useDashboardLayout()
  const widget = layout.find((w) => w.id === id)
  const isFull = widget?.size === "full"
  const isFixed = WIDGET_DEFS.find((d) => d.id === id)?.fixedFull

  if (!editMode) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={`${className} relative group/widget`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index) }}
      onDrop={onDrop}
    >
      {/* Edit overlay bar */}
      <div className="absolute inset-0 rounded-xl ring-2 ring-primary/40 z-10 pointer-events-none" />
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
        {!isFixed && (
          <button
            onClick={() => toggleSize(id)}
            className="w-7 h-7 rounded-md bg-background/90 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-all shadow-sm"
            title={isFull ? "Make half width" : "Make full width"}
          >
            {isFull ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          onClick={() => toggleVisible(id)}
          className="w-7 h-7 rounded-md bg-background/90 border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-background transition-all shadow-sm"
          title="Hide widget"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="absolute top-2 left-2 z-20">
        <div
          className="w-7 h-7 rounded-md bg-background/90 border border-border flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing shadow-sm"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="pointer-events-none opacity-80">{children}</div>
    </div>
  )
}

// ─── Visibility panel (shown in edit mode) ────────────────────────────────────

export function DashboardVisibilityPanel() {
  const { layout, toggleVisible, editMode } = useDashboardLayout()
  const hidden = layout.filter((w) => !w.visible)
  if (!editMode || hidden.length === 0) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-xl p-3 flex flex-wrap gap-2 max-w-sm">
      <p className="w-full text-xs text-muted-foreground font-medium mb-1">Hidden — click to show:</p>
      {hidden.map((w) => {
        const def = WIDGET_DEFS.find((d) => d.id === w.id)
        return (
          <button
            key={w.id}
            onClick={() => toggleVisible(w.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all bg-muted/30"
          >
            <Eye className="w-3 h-3" />
            {def?.label}
          </button>
        )
      })}
    </div>
  )
}

// Kept for backward compat
export function DashboardCustomizer() {
  return null
}
