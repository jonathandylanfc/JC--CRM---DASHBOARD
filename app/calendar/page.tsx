import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { CalendarContent } from "@/components/calendar/calendar-content"
import { PaycheckCard } from "@/components/calendar/paycheck-card"
import { getUserProfile, getPaySettings, getBudgetCategories } from "@/lib/data"

export default async function CalendarPage() {
  const [user, paySettings, budgetCategories] = await Promise.all([
    getUserProfile(),
    getPaySettings(),
    getBudgetCategories(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64 pb-20 lg:pb-5">
        <Header
          title="Calendar"
          description="Schedule and track your events and meetings."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <PaycheckCard initialPaySettings={paySettings} budgetCategories={budgetCategories} />
          <CalendarContent />
        </div>
      </main>
    </div>
  )
}
