"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, ListTodo } from "lucide-react"

interface Task {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string | null
}

interface TeamCollaborationProps {
  tasks: Task[]
}

const statusConfig: Record<string, { label: string; color: string }> = {
  done: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  todo: { label: "To Do", color: "bg-blue-100 text-blue-700" },
  cancelled: { label: "Cancelled", color: "bg-rose-100 text-rose-700" },
}

const priorityColors: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-muted-foreground",
}

export function TeamCollaboration({ tasks }: TeamCollaborationProps) {
  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up"
      style={{ animationDelay: "600ms" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Task Board</h2>
        <Button variant="outline" size="sm" className="transition-all duration-300 hover:scale-105 bg-transparent">
          <Plus className="w-4 h-4 mr-1" />
          Add Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <ListTodo className="w-10 h-10 text-primary/40" />
          <p className="text-sm text-muted-foreground">No tasks yet — add your first task to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task, index) => {
            const status = statusConfig[task.status] ?? statusConfig.todo
            const initials = task.title.slice(0, 2).toUpperCase()
            return (
              <div
                key={task.id}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary transition-all duration-300 cursor-pointer group"
                style={{ animationDelay: `${650 + index * 100}ms` }}
              >
                <div
                  className={`w-12 h-12 rounded-full ${priorityColors[task.priority] ?? priorityColors.medium} flex items-center justify-center text-white text-sm font-bold ring-2 ring-primary/20 transition-all duration-300 group-hover:ring-primary/40 group-hover:scale-110 flex-shrink-0`}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Priority: <span className="font-medium">{task.priority}</span>
                  </p>
                </div>
                <span
                  className={`${status.color} text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-300 group-hover:scale-105 whitespace-nowrap`}
                >
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
