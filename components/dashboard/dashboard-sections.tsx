"use client"

import { StatsCards } from "@/components/dashboard/stats-cards"
import { TaskBoardCard } from "@/components/dashboard/task-board-card"
import { BudgetHealthCard } from "@/components/dashboard/budget-health-card"
import { RecentTransactionsCard } from "@/components/dashboard/recent-transactions-card"
import { BillRemindersCard } from "@/components/dashboard/bill-reminders-card"
import { SpendingInsightsCard } from "@/components/dashboard/spending-insights-card"
import { WeeklyGoalsCard } from "@/components/dashboard/weekly-goals-card"
import { WeeklyRecapCard } from "@/components/dashboard/weekly-recap-card"
import { useDashboardSections } from "@/components/dashboard/dashboard-customizer"

interface Props {
  taskStats: { total: number; done: number; inProgress: number; todo: number }
  recentTasks: Array<{ id: string; title: string; due_date: string | null; status: string; priority: string }>
  financeSummary: { income: number; expenses: number }
  expensesByCategory: Record<string, number>
  categories: Array<{ id: string; name: string; type: "percentage" | "fixed"; value: number; sort_order: number; rollover: boolean; is_catchall: boolean; linked_account: string | null }>
  recentTransactions: Array<{ id: string; title: string; amount: number; type: string; category: string; date: string; account_name: string | null }>
  upcomingBills: Array<{ id: string; name: string; amount: number; billing_cycle: string; next_billing_date: string; category: string | null }>
  savingsGoals: Array<{ id: string; name: string; target_amount: number; current_amount: number; color: string; monthly_contribution_value: number | null; monthly_contribution_type: string | null }>
  weeklyRecap: { thisWeek: Record<string, number>; lastWeek: Record<string, number>; thisTotal: number; lastTotal: number }
}

export function DashboardSections({ taskStats, recentTasks, financeSummary, expensesByCategory, categories, recentTransactions, upcomingBills, savingsGoals, weeklyRecap }: Props) {
  const { isVisible } = useDashboardSections()

  return (
    <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
      {isVisible("stats") && (
        <StatsCards
          totalTasks={taskStats.total}
          tasksDone={taskStats.done}
          monthlyIncome={financeSummary.income}
          monthlyExpenses={financeSummary.expenses}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        {isVisible("tasks") && (
          <div className="lg:col-span-2">
            <TaskBoardCard tasks={recentTasks} />
          </div>
        )}
        {isVisible("budget_health") && (
          <BudgetHealthCard
            categories={categories}
            expensesByCategory={expensesByCategory}
            monthlyIncome={financeSummary.income}
          />
        )}
      </div>

      {isVisible("recent_transactions") && (
        <RecentTransactionsCard transactions={recentTransactions} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        {isVisible("goals") && (
          <WeeklyGoalsCard goals={savingsGoals} monthlyIncome={financeSummary.income} />
        )}
        {isVisible("bill_reminders") && upcomingBills.length > 0 && (
          <BillRemindersCard subscriptions={upcomingBills} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <WeeklyRecapCard
          thisWeek={weeklyRecap.thisWeek}
          lastWeek={weeklyRecap.lastWeek}
          thisTotal={weeklyRecap.thisTotal}
          lastTotal={weeklyRecap.lastTotal}
        />
        {isVisible("insights") && (
          <SpendingInsightsCard />
        )}
      </div>
    </div>
  )
}
