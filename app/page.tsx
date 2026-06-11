import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { DashboardLayoutProvider, DashboardEditButton, DashboardVisibilityPanel } from "@/components/dashboard/dashboard-customizer"
import { DashboardSections } from "@/components/dashboard/dashboard-sections"
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card"
import { UpcomingEventsCard } from "@/components/dashboard/upcoming-events-card"
import {
  getTaskStats,
  getRecentTasks,
  getUserProfile,
  getMonthlyFinanceSummary,
  getMonthlyExpensesByCategory,
  getBudgetCategories,
  getRecentTransactions,
  getUpcomingSubscriptions,
  getSavingsGoals,
  getWeeklySpendingSummary,
  getLatestBriefing,
  getUpcomingCalendarEvents,
} from "@/lib/data"

export default async function DashboardPage() {
  const [
    taskStats,
    recentTasks,
    user,
    financeSummary,
    expensesByCategory,
    categories,
    recentTransactions,
    upcomingBills,
    savingsGoals,
    weeklyRecap,
    latestBriefing,
    upcomingEvents,
  ] = await Promise.all([
    getTaskStats(),
    getRecentTasks(),
    getUserProfile(),
    getMonthlyFinanceSummary(),
    getMonthlyExpensesByCategory(),
    getBudgetCategories(),
    getRecentTransactions(5),
    getUpcomingSubscriptions(7),
    getSavingsGoals(),
    getWeeklySpendingSummary(),
    getLatestBriefing(),
    getUpcomingCalendarEvents(),
  ])

  return (
    <DashboardLayoutProvider>
      <div className="flex min-h-screen bg-background">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64 pb-24 lg:pb-24">
          <Header
            title="Dashboard"
            description="Plan, prioritize, and accomplish your tasks with ease."
            user={user ?? undefined}
          />

          <div className="mt-4 space-y-4">
            <MorningBriefingCard briefing={latestBriefing} />
            <UpcomingEventsCard events={upcomingEvents} />

            <DashboardSections
              taskStats={taskStats}
              recentTasks={recentTasks}
              financeSummary={financeSummary}
              expensesByCategory={expensesByCategory}
              categories={categories}
              recentTransactions={recentTransactions}
              upcomingBills={upcomingBills}
              savingsGoals={savingsGoals}
              weeklyRecap={weeklyRecap}
            />
          </div>
        </main>

        <DashboardVisibilityPanel />
        <DashboardEditButton />
      </div>
    </DashboardLayoutProvider>
  )
}
