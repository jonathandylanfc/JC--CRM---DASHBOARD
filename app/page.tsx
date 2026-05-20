import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { TaskBoardCard } from "@/components/dashboard/task-board-card"
import { BudgetHealthCard } from "@/components/dashboard/budget-health-card"
import { RecentTransactionsCard } from "@/components/dashboard/recent-transactions-card"
import { BillRemindersCard } from "@/components/dashboard/bill-reminders-card"
import { SpendingInsightsCard } from "@/components/dashboard/spending-insights-card"
import { WeeklyGoalsCard } from "@/components/dashboard/weekly-goals-card"
import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer"
import { DashboardSections } from "@/components/dashboard/dashboard-sections"
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
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Dashboard"
          description="Plan, prioritize, and accomplish your tasks with ease."
          user={user ?? undefined}
          actions={<DashboardCustomizer />}
        />

        <DashboardSections
          taskStats={taskStats}
          recentTasks={recentTasks}
          financeSummary={financeSummary}
          expensesByCategory={expensesByCategory}
          categories={categories}
          recentTransactions={recentTransactions}
          upcomingBills={upcomingBills}
          savingsGoals={savingsGoals}
        />
      </main>
    </div>
  )
}
