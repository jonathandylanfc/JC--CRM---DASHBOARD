"use client"

import { Card } from "@/components/ui/card"
import { CalendarClock, CheckCircle2 } from "lucide-react"
import { format, isToday, isTomorrow } from "date-fns"

interface Task {
  id: string
  title: string
  due_date: string | null
  priority: string
}

interface RemindersProps {
  tasks: Task[]
}

const priorityColors: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-muted text-muted-foreground",
}

function dueLabel(due: string) {
  const d = new Date(due)
  if (isToday(d)) return "Due today"
  if (isTomorrow(d)) return "Due tomorrow"
  return `Due ${format(d, "MMM d")}`
}

export function Reminders({ tasks }: RemindersProps) {
  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up"
      style={{ animationDelay: "500ms" }}
    >
      <h2 className="text-xl font-semibold text-foreground mb-4">Upcoming</h2>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
          <CheckCircle2 className="w-8 h-8 text-primary/40" />
          <p className="text-sm text-muted-foreground">No upcoming tasks with due dates</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-card border border-border rounded-xl p-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
            >
              <h3 className="font-semibold text-foreground text-sm mb-1 line-clamp-2">{task.title}</h3>
              <div className="flex items-center justify-between mt-2 gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>{task.due_date ? dueLabel(task.due_date) : ""}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority] ?? priorityColors.medium}`}>
                  {task.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
