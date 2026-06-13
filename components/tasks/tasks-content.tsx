"use client"

import { useState, useTransition, useOptimistic, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Search, Plus, Trash2, CalendarDays, ClipboardList, Calendar, RefreshCw, Tag, Pencil, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react"
import { format, startOfDay } from "date-fns"
import { toast } from "sonner"
import { createTask, updateTask, toggleTaskStatus, deleteTask } from "@/app/tasks/actions"

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  start_time: string | null
  end_time: string | null
  priority: string
  status: string
  created_at: string
  completed_at: string | null
  recurrence: string
  task_category: string | null
  calendar_event_id: string | null
  calendar_id: string | null
}

interface TasksContentProps {
  initialTasks: Task[]
}

const priorityBadge: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700 border-rose-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-muted text-muted-foreground border-border",
}

const recurrenceLabel: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

const statusTabs = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
]

export function TasksContent({ initialTasks }: TasksContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [calendarPending, setCalendarPending] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState("")
  const [formDueDate, setFormDueDate] = useState("")
  const [addToCalendar, setAddToCalendar] = useState(true)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [expandCompletedOpen, setExpandCompletedOpen] = useState(false)
  const [expandPreviousOpen, setExpandPreviousOpen] = useState(false)

  // Persist calendar preference
  useEffect(() => {
    const stored = localStorage.getItem("task_add_to_calendar")
    if (stored !== null) setAddToCalendar(stored === "true")
  }, [])

  function toggleCalendarPref(val: boolean) {
    setAddToCalendar(val)
    localStorage.setItem("task_add_to_calendar", String(val))
  }

  const [optimisticTasks, updateOptimisticTasks] = useOptimistic(
    initialTasks,
    (state: Task[], action: { type: "toggle"; id: string } | { type: "delete"; id: string } | { type: "add"; task: Task }) => {
      if (action.type === "toggle") {
        return state.map((t) =>
          t.id === action.id
            ? {
                ...t,
                status: t.status === "done" ? "todo" : "done",
                completed_at: t.status === "done" ? null : new Date().toISOString(),
              }
            : t
        )
      }
      if (action.type === "delete") {
        return state.filter((t) => t.id !== action.id)
      }
      if (action.type === "add") {
        return [action.task, ...state]
      }
      return state
    }
  )

  // Derive unique categories from tasks
  const allCategories = Array.from(
    new Set(optimisticTasks.map((t) => t.task_category).filter(Boolean) as string[])
  ).sort()

  // Tasks completed today vs older (local-timezone aware)
  const todayStart = startOfDay(new Date())
  const isCompletedToday = (t: Task) =>
    t.status === "done" && !!t.completed_at && new Date(t.completed_at) >= todayStart
  const isCompletedBefore = (t: Task) =>
    t.status === "done" && (!t.completed_at || new Date(t.completed_at) < todayStart)

  // Sorting helpers
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

  const sortActive = (a: Task, b: Task) => {
    // Due date first: tasks with a date before tasks without
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    if (a.due_date && b.due_date) {
      const diff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      if (diff !== 0) return diff
    }
    // Secondary: priority (urgent → low)
    return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  }

  const sortCompleted = (a: Task, b: Task) => {
    // Most recently completed first
    if (!a.completed_at && !b.completed_at) return 0
    if (!a.completed_at) return 1
    if (!b.completed_at) return -1
    return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  }

  // Active (non-done) tasks for the main list
  const visible = optimisticTasks.filter((t) => {
    if (t.status === "done") {
      // Only show done tasks in the main list when the Done tab is active
      if (filter !== "done") return false
      const matchesCategory = categoryFilter === "all" || t.task_category === categoryFilter
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    }
    const matchesStatus = filter === "all" || t.status === filter
    const matchesCategory = categoryFilter === "all" || t.task_category === categoryFilter
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesCategory && matchesSearch
  }).sort((a, b) => a.status === "done" ? sortCompleted(a, b) : sortActive(a, b))

  // Today's completed tasks (for the collapsible summary row, shown when not on Done tab)
  const completedToday = optimisticTasks.filter((t) => {
    if (!isCompletedToday(t)) return false
    const matchesCategory = categoryFilter === "all" || t.task_category === categoryFilter
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  }).sort(sortCompleted)

  // Previously completed tasks (before today)
  const completedBefore = optimisticTasks.filter((t) => {
    if (!isCompletedBefore(t)) return false
    const matchesCategory = categoryFilter === "all" || t.task_category === categoryFilter
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  }).sort(sortCompleted)

  const counts = {
    all: optimisticTasks.filter((t) => t.status !== "done").length,
    todo: optimisticTasks.filter((t) => t.status === "todo").length,
    in_progress: optimisticTasks.filter((t) => t.status === "in_progress").length,
    done: optimisticTasks.filter((t) => t.status === "done").length,
  }

  function handleToggle(task: Task) {
    startTransition(async () => {
      updateOptimisticTasks({ type: "toggle", id: task.id })
      await toggleTaskStatus(task.id, task.status)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      updateOptimisticTasks({ type: "delete", id })
      await deleteTask(id)
      router.refresh()
    })
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingTask) return
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateTask(editingTask.id, fd)
      if (result?.error) { setEditError(result.error); return }
      toast.success("Task updated")
      setEditingTask(null)
      router.refresh()
    })
  }

  async function handleSendToCalendar(task: Task) {
    if (!task.due_date) return
    setCalendarPending(task.id)
    try {
      const dateStr = task.due_date.slice(0, 10)
      const startUtc = task.start_time
        ? new Date(`${dateStr}T${task.start_time}:00`).toISOString() : undefined
      const endUtc = task.end_time
        ? new Date(`${dateStr}T${task.end_time}:00`).toISOString() : undefined
      const res = await fetch("/api/calendar/task-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          title: task.title,
          due_date: dateStr,
          description: task.description ?? undefined,
          priority: task.priority,
          startUtc,
          endUtc,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.error === "not_connected") toast.error("Connect Google Calendar in Settings first")
        else if (data.error === "reconnect_required") toast.error("Google Calendar needs to be reconnected in Settings")
        else toast.error("Could not add to Google Calendar — check Settings")
      } else {
        toast.success("Added to Google Calendar")
        router.refresh()
      }
    } catch {
      toast.error("Failed to add to Google Calendar")
    } finally {
      setCalendarPending(null)
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const title = fd.get("title") as string
    const due_date = (fd.get("due_date") as string) || null
    const start_time = (fd.get("start_time") as string) || null
    const end_time = (fd.get("end_time") as string) || null
    const reminder = (fd.get("reminder") as string) || "none"
    const description = (fd.get("description") as string) || null
    const priority = (fd.get("priority") as string) || "medium"

    const tempTask: Task = {
      id: crypto.randomUUID(),
      title,
      description,
      due_date,
      start_time,
      end_time,
      priority,
      status: "todo",
      created_at: new Date().toISOString(),
      completed_at: null,
      recurrence: (fd.get("recurrence") as string) || "none",
      task_category: (fd.get("task_category") as string) || null,
    }

    setOpen(false)
    setFormDueDate("")
    startTransition(async () => {
      updateOptimisticTasks({ type: "add", task: tempTask })
      const result = await createTask(fd)
      if (result?.error) { setFormError(result.error); return }

      // Auto-add to Google Calendar if enabled and due date exists
      if (addToCalendar && due_date) {
        try {
          const res = await fetch("/api/calendar/task-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, due_date, description: description ?? undefined, priority, start_time: start_time ?? undefined, end_time: end_time ?? undefined, reminder: reminder !== "none" ? reminder : undefined }),
          })
          const data = await res.json()
          if (data.error === "not_connected") toast.info("Connect Google Calendar in Settings to auto-add tasks")
          else if (data.error === "reconnect_required") toast.warning("Reconnect Google Calendar in Settings")
          else if (!data.error) toast.success("Task created & added to Google Calendar")
        } catch { /* silent */ }
      } else {
        toast.success("Task created")
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFormDueDate(""); setNewCategory("") } }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="What needs to be done?" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="description" name="description" placeholder="Add details…" rows={3} />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="task_category">Category <span className="text-muted-foreground">(optional)</span></Label>
                <div className="flex gap-2">
                  <Input
                    id="task_category"
                    name="task_category"
                    placeholder="e.g. Work, Personal, Health…"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    list="category-suggestions"
                    className="flex-1"
                  />
                  <datalist id="category-suggestions">
                    {allCategories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input id="due_date" name="due_date" type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <Select name="priority" defaultValue="medium">
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Time range + reminder — only show when a date is set */}
              {formDueDate && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="start_time">Start Time <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="start_time" name="start_time" type="time" className="block" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="end_time">End Time <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="end_time" name="end_time" type="time" className="block" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reminder">Alert</Label>
                    <Select name="reminder" defaultValue="none">
                      <SelectTrigger id="reminder"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No alert</SelectItem>
                        <SelectItem value="0">At start time</SelectItem>
                        <SelectItem value="5">5 minutes before</SelectItem>
                        <SelectItem value="15">15 minutes before</SelectItem>
                        <SelectItem value="30">30 minutes before</SelectItem>
                        <SelectItem value="60">1 hour before</SelectItem>
                        <SelectItem value="1440">1 day before</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Recurrence */}
              <div className="space-y-1.5">
                <Label htmlFor="recurrence">Repeat</Label>
                <Select name="recurrence" defaultValue="none">
                  <SelectTrigger id="recurrence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">When completed, the next occurrence is automatically created</p>
              </div>

              {/* Google Calendar toggle */}
              <div
                className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${addToCalendar ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                onClick={() => toggleCalendarPref(!addToCalendar)}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Add to Google Calendar</p>
                    <p className="text-xs text-muted-foreground">{formDueDate ? "Will be added when task is created" : "Set a due date to enable"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${addToCalendar ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${addToCalendar ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Creating…" : "Create Task"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {statusTabs.map((tab) => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? "default" : "outline"}
            onClick={() => setFilter(tab.key)}
            size="sm"
            className={filter !== tab.key ? "bg-transparent" : ""}
          >
            {tab.label} ({counts[tab.key as keyof typeof counts]})
          </Button>
        ))}
      </div>

      {/* Category filter chips */}
      {allCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setCategoryFilter("all")}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            All categories
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Task list */}
      {visible.length === 0 && completedToday.length === 0 && completedBefore.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <ClipboardList className="w-12 h-12 text-primary/30" />
          <p className="text-muted-foreground text-sm">
            {search ? `No tasks matching "${search}"` : "No tasks here yet"}
          </p>
          {!search && (
            <Button size="sm" onClick={() => setOpen(true)} className="gap-2 mt-1">
              <Plus className="w-4 h-4" />
              Add your first task
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((task, index) => (
            <Card
              key={task.id}
              className="p-4 hover:shadow-lg transition-all duration-300 animate-slide-in-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => handleToggle(task)}
                  className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    task.status === "done"
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/50 hover:border-primary bg-background hover:bg-primary/10"
                  }`}
                  aria-label={task.status === "done" ? "Mark as todo" : "Mark as done"}
                >
                  {task.status === "done" && (
                    <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        className={`font-semibold text-foreground leading-snug ${
                          task.status === "done" ? "line-through opacity-50" : ""
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.task_category && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Tag className="w-3 h-3" />
                          {task.task_category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                          priorityBadge[task.priority] ?? priorityBadge.medium
                        }`}
                      >
                        {task.priority}
                      </span>
                      {task.recurrence !== "none" && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400 flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5" />
                          {recurrenceLabel[task.recurrence]}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        onClick={() => { setEditingTask(task); setEditError(null) }}
                        title="Edit task"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {task.due_date && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => handleSendToCalendar(task)}
                          disabled={calendarPending === task.id}
                          title="Send to Google Calendar"
                        >
                          <Calendar className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(task.id)}
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {task.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {format(new Date(task.due_date.slice(0, 10) + "T12:00:00"), "MMM d, yyyy")}
                        {task.start_time && (
                          <span className="ml-1 font-medium text-foreground">
                            {new Date(`2000-01-01T${task.start_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                            {task.end_time && ` – ${new Date(`2000-01-01T${task.end_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`}
                          </span>
                        )}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 px-2 capitalize"
                    >
                      {task.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Completed today — collapsible summary row (hidden when Done tab is active) */}
          {filter !== "done" && completedToday.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpandCompletedOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-green-500/40 bg-green-500/5 hover:bg-green-500/10 transition-colors text-sm text-green-600 dark:text-green-400"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left font-medium">
                  ✓ {completedToday.length} completed today
                </span>
                {expandCompletedOpen
                  ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                  : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                }
              </button>

              {expandCompletedOpen && (
                <div className="mt-2 grid gap-2">
                  {completedToday.map((task) => (
                    <Card
                      key={task.id}
                      className="p-3 opacity-60 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggle(task)}
                          className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all bg-primary border-primary"
                          aria-label="Mark as todo"
                        >
                          <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium line-through text-muted-foreground truncate">{task.title}</p>
                            {task.task_category && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {task.task_category}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(task.id)}
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Previously completed — tasks done before today, always shown */}
          {filter !== "done" && completedBefore.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpandPreviousOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 hover:bg-muted/40 transition-colors text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left font-medium">
                  {completedBefore.length} previously completed
                </span>
                {expandPreviousOpen
                  ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                  : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                }
              </button>

              {expandPreviousOpen && (
                <div className="mt-2 grid gap-2">
                  {completedBefore.map((task) => (
                    <Card
                      key={task.id}
                      className="p-3 opacity-50 hover:opacity-70 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggle(task)}
                          className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all bg-muted border-muted-foreground/30"
                          aria-label="Mark as todo"
                        >
                          <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium line-through text-muted-foreground truncate">{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {task.task_category && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Tag className="w-3 h-3" />
                                  {task.task_category}
                                </span>
                              )}
                              {task.completed_at && (
                                <span className="text-[11px] text-muted-foreground">
                                  {format(new Date(task.completed_at), "MMM d")}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(task.id)}
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(v) => { if (!v) setEditingTask(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <form onSubmit={handleUpdate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" name="title" defaultValue={editingTask.title} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="edit-description" name="description" defaultValue={editingTask.description ?? ""} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-category">Category <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="edit-category"
                  name="task_category"
                  defaultValue={editingTask.task_category ?? ""}
                  list="edit-category-suggestions"
                  placeholder="e.g. Work, Personal, Health…"
                />
                <datalist id="edit-category-suggestions">
                  {allCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-due-date">Due Date</Label>
                  <Input id="edit-due-date" name="due_date" type="date" defaultValue={editingTask.due_date ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Select name="priority" defaultValue={editingTask.priority}>
                    <SelectTrigger id="edit-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editingTask.due_date && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-start-time">Start Time <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="edit-start-time" name="start_time" type="time" defaultValue={editingTask.start_time ?? ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-end-time">End Time <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="edit-end-time" name="end_time" type="time" defaultValue={editingTask.end_time ?? ""} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-reminder">Alert</Label>
                    <Select name="reminder" defaultValue="none">
                      <SelectTrigger id="edit-reminder"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No alert</SelectItem>
                        <SelectItem value="0">At start time</SelectItem>
                        <SelectItem value="5">5 minutes before</SelectItem>
                        <SelectItem value="15">15 minutes before</SelectItem>
                        <SelectItem value="30">30 minutes before</SelectItem>
                        <SelectItem value="60">1 hour before</SelectItem>
                        <SelectItem value="1440">1 day before</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingTask.status}>
                    <SelectTrigger id="edit-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-recurrence">Repeat</Label>
                  <Select name="recurrence" defaultValue={editingTask.recurrence ?? "none"}>
                    <SelectTrigger id="edit-recurrence"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Does not repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setEditingTask(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
