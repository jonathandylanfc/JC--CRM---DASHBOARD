"use client"

import { useState, useTransition, useOptimistic } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Search, Plus, Trash2, CalendarDays, ClipboardList } from "lucide-react"
import { format } from "date-fns"
import { createTask, toggleTaskStatus, deleteTask } from "@/app/tasks/actions"

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: string
  status: string
  created_at: string
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
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [optimisticTasks, updateOptimisticTasks] = useOptimistic(
    initialTasks,
    (state: Task[], action: { type: "toggle"; id: string } | { type: "delete"; id: string } | { type: "add"; task: Task }) => {
      if (action.type === "toggle") {
        return state.map((t) =>
          t.id === action.id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t
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

  const visible = optimisticTasks.filter((t) => {
    const matchesFilter =
      filter === "all" ||
      t.status === filter
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const counts = {
    all: optimisticTasks.length,
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

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const title = fd.get("title") as string

    const tempTask: Task = {
      id: crypto.randomUUID(),
      title,
      description: (fd.get("description") as string) || null,
      due_date: (fd.get("due_date") as string) || null,
      priority: (fd.get("priority") as string) || "medium",
      status: "todo",
      created_at: new Date().toISOString(),
    }

    setOpen(false)
    startTransition(async () => {
      updateOptimisticTasks({ type: "add", task: tempTask })
      const result = await createTask(fd)
      if (result?.error) setFormError(result.error)
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

        <Dialog open={open} onOpenChange={setOpen}>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input id="due_date" name="due_date" type="date" />
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

      {/* Filter tabs */}
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

      {/* Task list */}
      {visible.length === 0 ? (
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
              className="p-4 hover:shadow-lg transition-all duration-300 group animate-slide-in-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start gap-4">
                <Checkbox
                  checked={task.status === "done"}
                  onCheckedChange={() => handleToggle(task)}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className={`font-semibold text-foreground leading-snug ${
                        task.status === "done" ? "line-through opacity-50" : ""
                      }`}
                    >
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                          priorityBadge[task.priority] ?? priorityBadge.medium
                        }`}
                      >
                        {task.priority}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(task.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                        {format(new Date(task.due_date), "MMM d, yyyy")}
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
        </div>
      )}
    </div>
  )
}
