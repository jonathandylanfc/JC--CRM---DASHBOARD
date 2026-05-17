import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { BudgetContent } from "@/components/budget/budget-content"
import {
  getBudgetCategories,
  getMonthlyFinanceSummary,
  getMonthlyExpensesByCategory,
  getMonthlyExpenseTransactions,
  getUserProfile,
  getSavingsGoals,
} from "@/lib/data"
import { format, subMonths } from "date-fns"

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const currentMonth = month ?? format(new Date(), "yyyy-MM")

  // Compute last month string for comparison
  const currentMonthDate = new Date(currentMonth + "-02")
  const lastMonth = format(subMonths(currentMonthDate, 1), "yyyy-MM")

  const [categories, financeSummary, expensesByCategory, monthlyTransactions, lastMonthExpenses, savingsGoals, user] = await Promise.all([
    getBudgetCategories(),
    getMonthlyFinanceSummary(currentMonth),
    getMonthlyExpensesByCategory(currentMonth),
    getMonthlyExpenseTransactions(currentMonth),
    getMonthlyExpensesByCategory(lastMonth),
    getSavingsGoals(),
    getUserProfile(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Budget"
          description="Plan where your money goes each month."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <BudgetContent
            initialCategories={categories}
            monthlyIncome={financeSummary.income}
            expensesByCategory={expensesByCategory}
            monthlyTransactions={monthlyTransactions}
            lastMonthExpenses={lastMonthExpenses}
            initialSavingsGoals={savingsGoals}
            currentMonth={currentMonth}
          />
        </div>
      </main>
    </div>
  )
}
