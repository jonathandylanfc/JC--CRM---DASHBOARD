import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { FinanceContent } from "@/components/finance/finance-content"
import {
  getAllTransactions,
  getAllSubscriptions,
  getMonthlyFinanceSummary,
  getUserProfile,
  getStartingBalance,
  getBudgetCategories,
  getMonthlyExpensesByCategory,
} from "@/lib/data"

export default async function FinancePage() {
  const [transactions, subscriptions, financeSummary, user, startingBalance, budgetCategories, currentMonthExpenses] = await Promise.all([
    getAllTransactions(),
    getAllSubscriptions(),
    getMonthlyFinanceSummary(),
    getUserProfile(),
    getStartingBalance(),
    getBudgetCategories(),
    getMonthlyExpensesByCategory(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Finance"
          description="Track your income, expenses, and subscriptions."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <FinanceContent
            initialTransactions={transactions}
            initialSubscriptions={subscriptions}
            monthlyIncome={financeSummary.income}
            monthlyExpenses={financeSummary.expenses}
            initialStartingBalance={startingBalance}
            budgetCategories={budgetCategories}
            currentMonthExpenses={currentMonthExpenses}
          />
        </div>
      </main>
    </div>
  )
}
