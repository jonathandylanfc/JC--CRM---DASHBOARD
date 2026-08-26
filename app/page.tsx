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
  getPaySettings,
} from "@/lib/data"
import { computeCurrentPayPeriod } from "@/lib/pay-period"
import { getSpendingChallenges, getLinkedAccounts } from "@/app/finance/spending-challenge-actions"
import { SpendingChallengeCard } from "@/components/dashboard/spending-challenge-card"

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
    spendingChallenges,
    plaidAccounts,
    paySettings,
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
    getSpendingChallenges(),
    getLinkedAccounts(),
    getPaySettings(),
  ])

  // Compute the next upcoming payday (end of pay period + delay days)
  let nextPayday: string | null = null
  if (paySettings) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let offset = 0; offset <= 2; offset++) {
      const period = computeCurrentPayPeriod(paySettings.pay_period, paySettings.pay_period_start_date, offset)
      const payday = new Date(period.end)
      payday.setDate(payday.getDate() + (paySettings.pay_delay_days ?? 0))
      payday.setHours(0, 0, 0, 0)
      if (payday >= today) {
        nextPayday = payday.toISOString().split("T")[0]
        break
      }
    }
  }

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

            <SpendingChallengeCard initialChallenges={spendingChallenges} plaidAccounts={plaidAccounts} />

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
              nextPayday={nextPayday}
            />

            <DashboardEditButton />
          </div>
        </main>

        <DashboardVisibilityPanel />
      </div>
    </DashboardLayoutProvider>
  )
}
