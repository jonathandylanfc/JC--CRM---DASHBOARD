"use client"

import { Card } from "@/components/ui/card"
import { Plus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"

interface Task {
  id: string
  title: string
  due_date: string | null
  status: string
  priority: string
}

interface ProjectListProps {
  tasks: Task[]
}

const indexColors = [
  "bg-blue-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
]

const statusIcons: Record<string, string> = {
  todo: "📋",
  in_progress: "⚡",
  done: "✅",
  cancelled: "❌",
}

export function ProjectList({ tasks }: ProjectListProps) {
  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up"
      style={{ animationDelay: "700ms" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Recent Tasks</h2>
        <Button variant="outline" size="sm" className="transition-all duration-300 hover:scale-105 bg-transparent">
          <Plus className="w-4 h-4 mr-1" />
          New
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <ClipboardList className="w-8 h-8 text-primary/40" />
          <p className="text-sm text-muted-foreground">No tasks yet — create your first one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-all duration-300 cursor-pointer group"
            >
              <div
                className={`${indexColors[index % indexColors.length]} w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12`}
              >
                {statusIcons[task.status] ?? "📋"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.due_date ? `Due ${format(new Date(task.due_date), "MMM d, yyyy")}` : "No due date"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
