import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { BudgetContent } from "@/components/budget/budget-content"
import {
  getBudgetCategories,
  getMonthlyFinanceSummary,
  getMonthlyExpensesByCategory,
  getUserProfile,
} from "@/lib/data"

export default async function BudgetPage() {
  const [categories, financeSummary, expensesByCategory, user] = await Promise.all([
    getBudgetCategories(),
    getMonthlyFinanceSummary(),
    getMonthlyExpensesByCategory(),
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
          />
        </div>
      </main>
    </div>
  )
}
