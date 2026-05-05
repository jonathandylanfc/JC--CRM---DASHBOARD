import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { TasksContent } from "@/components/tasks/tasks-content"
import { getAllTasks, getUserProfile } from "@/lib/data"

export default async function TasksPage() {
  const [tasks, user] = await Promise.all([getAllTasks(), getUserProfile()])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Tasks"
          description="Manage and organize your tasks efficiently."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <TasksContent initialTasks={tasks} />
        </div>
      </main>
    </div>
  )
}
