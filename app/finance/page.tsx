import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { FinanceContent } from "@/components/finance/finance-content"
import { TransactionReview } from "@/components/finance/transaction-review"
import {
  getAllTransactions,
  getAllSubscriptions,
  getMonthlyFinanceSummary,
  getUserProfile,
  getStartingBalance,
  getBudgetCategories,
  getMonthlyExpensesByCategory,
  getConnectedBankNames,
} from "@/lib/data"
import { createClient } from "@/lib/supabase/server"

async function getUnreviewedTransactions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from("transactions")
    .select("id, title, amount, type, category, date, account_name, reviewed, snoozed_until")
    .eq("user_id", user.id)
    .eq("reviewed", false)
    .order("date", { ascending: false })
    .limit(50)
  return data ?? []
}

export default async function FinancePage() {
  const [transactions, subscriptions, financeSummary, user, startingBalance, budgetCategories, currentMonthExpenses, connectedBankNames, unreviewedTransactions] = await Promise.all([
    getAllTransactions(),
    getAllSubscriptions(),
    getMonthlyFinanceSummary(),
    getUserProfile(),
    getStartingBalance(),
    getBudgetCategories(),
    getMonthlyExpensesByCategory(),
    getConnectedBankNames(),
    getUnreviewedTransactions(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64 pb-20 lg:pb-5">
        <Header
          title="Finance"
          description="Track your income, expenses, and subscriptions."
          user={user ?? undefined}
        />
        <div className="mt-6 space-y-6">
          {unreviewedTransactions.length > 0 && (
            <TransactionReview transactions={unreviewedTransactions} />
          )}
          <FinanceContent
            initialTransactions={transactions}
            initialSubscriptions={subscriptions}
            monthlyIncome={financeSummary.income}
            monthlyExpenses={financeSummary.expenses}
            initialStartingBalance={startingBalance}
            budgetCategories={budgetCategories}
            currentMonthExpenses={currentMonthExpenses}
            connectedBankNames={connectedBankNames}
          />
        </div>
      </main>
    </div>
  )
}
