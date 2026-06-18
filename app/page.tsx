import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { DashboardLayoutProvider, DashboardEditButton, DashboardVisibilityPanel } from "@/components/dashboard/dashboard-customizer"
import { DashboardSections } from "@/components/dashboard/dashboard-sections"
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card"
import { UpcomingEventsCard } from "@/components/dashboard/upcoming-events-card"
import { NasaApodCard } from "@/components/dashboard/nasa-apod-card"
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

async function fetchNasaApod() {
  try {
    const key = process.env.NASA_API_KEY ?? "DEMO_KEY"
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export default async function DashboardPage() {
  const now = new Date()
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`

  const [
    taskStats,
    recentTasks,
    user,
    financeSummary,
    lastMonthSummary,
    expensesByCategory,
    categories,
    recentTransactions,
    upcomingBills,
    savingsGoals,
    weeklyRecap,
    latestBriefing,
    upcomingEvents,
    apod,
  ] = await Promise.all([
    getTaskStats(),
    getRecentTasks(),
    getUserProfile(),
    getMonthlyFinanceSummary(),
    getMonthlyFinanceSummary(lastMonthStr),
    getMonthlyExpensesByCategory(),
    getBudgetCategories(),
    getRecentTransactions(5),
    getUpcomingSubscriptions(7),
    getSavingsGoals(),
    getWeeklySpendingSummary(),
    getLatestBriefing(),
    getUpcomingCalendarEvents(),
    fetchNasaApod(),
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

            <NasaApodCard apod={apod} />

            <DashboardSections
              taskStats={taskStats}
              recentTasks={recentTasks}
              financeSummary={financeSummary}
              lastMonthSummary={lastMonthSummary}
              expensesByCategory={expensesByCategory}
              categories={categories}
              recentTransactions={recentTransactions}
              upcomingBills={upcomingBills}
              savingsGoals={savingsGoals}
              weeklyRecap={weeklyRecap}
            />

            <DashboardEditButton />
          </div>
        </main>

        <DashboardVisibilityPanel />
      </div>
    </DashboardLayoutProvider>
  )
}
