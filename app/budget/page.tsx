import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { BudgetContent } from "@/components/budget/budget-content"
import {
  getBudgetCategories,
  getMonthlyFinanceSummary,
  getMonthlyExpensesByCategory,
  getMonthlyExpenseTransactions,
  getUserProfile,
} from "@/lib/data"
import { format } from "date-fns"

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const currentMonth = month ?? format(new Date(), "yyyy-MM")

  const [categories, financeSummary, expensesByCategory, monthlyTransactions, user] = await Promise.all([
    getBudgetCategories(),
    getMonthlyFinanceSummary(currentMonth),
    getMonthlyExpensesByCategory(currentMonth),
    getMonthlyExpenseTransactions(currentMonth),
    getUserProfile(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
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
            currentMonth={currentMonth}
          />
        </div>
      </main>
    </div>
  )
}
