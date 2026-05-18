import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { TaskBoardCard } from "@/components/dashboard/task-board-card"
import { BudgetHealthCard } from "@/components/dashboard/budget-health-card"
import { RecentTransactionsCard } from "@/components/dashboard/recent-transactions-card"
import { Button } from "@/components/ui/button"
import {
  getTaskStats,
  getRecentTasks,
  getUserProfile,
  getMonthlyFinanceSummary,
  getMonthlyExpensesByCategory,
  getBudgetCategories,
  getRecentTransactions,
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
  ] = await Promise.all([
    getTaskStats(),
    getRecentTasks(),
    getUserProfile(),
    getMonthlyFinanceSummary(),
    getMonthlyExpensesByCategory(),
    getBudgetCategories(),
    getRecentTransactions(5),
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
          actions={
            <>
              <Button className="w-full sm:w-auto h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 hover:scale-105">
                + Add Task
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto h-9 text-sm transition-all duration-300 hover:shadow-md hover:scale-105 bg-transparent"
              >
                Import Data
              </Button>
            </>
          }
        />

        <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
          <StatsCards
            totalTasks={taskStats.total}
            tasksDone={taskStats.done}
            monthlyIncome={financeSummary.income}
            monthlyExpenses={financeSummary.expenses}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            {/* Left 2/3: Task board */}
            <div className="lg:col-span-2">
              <TaskBoardCard tasks={recentTasks} />
            </div>
            {/* Right 1/3: Budget health */}
            <BudgetHealthCard
              categories={categories}
              expensesByCategory={expensesByCategory}
              monthlyIncome={financeSummary.income}
            />
          </div>

          <RecentTransactionsCard transactions={recentTransactions} />
        </div>
      </main>
    </div>
  )
}
