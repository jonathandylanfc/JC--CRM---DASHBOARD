import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { CalendarContent } from "@/components/calendar/calendar-content"
import { getUserProfile } from "@/lib/data"

export default async function CalendarPage() {
  const user = await getUserProfile()
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Calendar"
          description="Schedule and track your events and meetings."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <CalendarContent />
        </div>
      </main>
    </div>
  )
}
