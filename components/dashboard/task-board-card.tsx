import Link from "next/link"
import { Card } from "@/components/ui/card"
import { ListTodo } from "lucide-react"

interface Task {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string | null
}

interface TaskBoardCardProps {
  tasks: Task[]
}

const statusConfig: Record<string, { label: string; color: string }> = {
  done: { label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  todo: { label: "To Do", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  cancelled: { label: "Cancelled", color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400" },
}

const priorityDotColors: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-muted-foreground",
}

function formatDue(dateStr: string | null | undefined) {
  if (!dateStr) return null
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function TaskBoardCard({ tasks }: TaskBoardCardProps) {
  return (
    <Card className="p-5 h-full transition-all duration-500 hover:shadow-xl animate-slide-in-up" style={{ animationDelay: "200ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Tasks</h2>
        <Link
          href="/tasks"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <ListTodo className="w-8 h-8 text-primary/30" />
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
          <Link href="/tasks" className="text-xs text-primary hover:underline">
            Add your first task
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map((task) => {
            const status = statusConfig[task.status] ?? statusConfig.todo
            const dotColor = priorityDotColors[task.priority] ?? priorityDotColors.medium
            const due = formatDue(task.due_date)
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  {due && (
                    <p className="text-xs text-muted-foreground mt-0.5">Due {due}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${status.color}`}>
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
