"use client"

import { useState } from "react"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { TaskBoardCard } from "@/components/dashboard/task-board-card"
import { BudgetHealthCard } from "@/components/dashboard/budget-health-card"
import { RecentTransactionsCard } from "@/components/dashboard/recent-transactions-card"
import { BillRemindersCard } from "@/components/dashboard/bill-reminders-card"
import { SpendingInsightsCard } from "@/components/dashboard/spending-insights-card"
import { WeeklyGoalsCard } from "@/components/dashboard/weekly-goals-card"
import { WeeklyRecapCard } from "@/components/dashboard/weekly-recap-card"
import { PortfolioSnapshotCard } from "@/components/dashboard/portfolio-snapshot-card"
import { NasaApodCard } from "@/components/dashboard/nasa-apod-card"
import { useDashboardLayout, WidgetWrapper, type WidgetId } from "@/components/dashboard/dashboard-customizer"

interface ApodData {
  title: string; date: string; explanation: string; url: string; hdurl?: string; media_type: "image" | "video"; copyright?: string
}

interface Props {
  taskStats: { total: number; done: number; inProgress: number; todo: number }
  recentTasks: Array<{ id: string; title: string; due_date: string | null; status: string; priority: string }>
  financeSummary: { income: number; expenses: number }
  lastMonthSummary: { income: number; expenses: number }
  expensesByCategory: Record<string, number>
  categories: Array<{ id: string; name: string; type: "percentage" | "fixed"; value: number; sort_order: number; rollover: boolean; is_catchall: boolean; linked_account: string | null }>
  recentTransactions: Array<{ id: string; title: string; amount: number; type: string; category: string; date: string; account_name: string | null }>
  upcomingBills: Array<{ id: string; name: string; amount: number; billing_cycle: string; next_billing_date: string; category: string | null }>
  savingsGoals: Array<{ id: string; name: string; target_amount: number; current_amount: number; color: string; monthly_contribution_value: number | null; monthly_contribution_type: string | null }>
  weeklyRecap: { thisWeek: Record<string, number>; lastWeek: Record<string, number>; thisTotal: number; lastTotal: number }
  apod?: ApodData | null
}

function WidgetContent({ id, props }: { id: WidgetId; props: Props }) {
  switch (id) {
    case "nasa_apod":
      return <NasaApodCard apod={props.apod ?? null} />
    case "stats":
      return (
        <StatsCards
          totalTasks={props.taskStats.total}
          tasksDone={props.taskStats.done}
          tasksDueToday={props.taskStats.dueToday ?? 0}
          monthlyIncome={props.financeSummary.income}
          monthlyExpenses={props.financeSummary.expenses}
          lastMonthIncome={props.lastMonthSummary.income}
          lastMonthExpenses={props.lastMonthSummary.expenses}
        />
      )
    case "tasks":
      return <TaskBoardCard tasks={props.recentTasks} />
    case "budget_health":
      return (
        <BudgetHealthCard
          categories={props.categories}
          expensesByCategory={props.expensesByCategory}
          monthlyIncome={props.financeSummary.income}
        />
      )
    case "recent_transactions":
      return <RecentTransactionsCard transactions={props.recentTransactions} />
    case "goals":
      return <WeeklyGoalsCard goals={props.savingsGoals} monthlyIncome={props.financeSummary.income} />
    case "bill_reminders":
      return props.upcomingBills.length > 0
        ? <BillRemindersCard subscriptions={props.upcomingBills} />
        : null
    case "weekly_recap":
      return (
        <WeeklyRecapCard
          thisWeek={props.weeklyRecap.thisWeek}
          lastWeek={props.weeklyRecap.lastWeek}
          thisTotal={props.weeklyRecap.thisTotal}
          lastTotal={props.weeklyRecap.lastTotal}
        />
      )
    case "insights":
      return <SpendingInsightsCard />
    case "portfolio":
      return <PortfolioSnapshotCard />
    default:
      return null
  }
}

export function DashboardSections(props: Props) {
  const { layout, editMode, mounted, reorder } = useDashboardLayout()
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const visible = [...layout]
    .sort((a, b) => a.order - b.order)
    .filter((w) => w.visible || !mounted)

  return (
    <div className="mt-4 md:mt-5">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {visible.map((widget, idx) => {
          const spanFull = widget.id === "stats" || widget.size === "full"
          const content = <WidgetContent id={widget.id} props={props} />
          if (content === null && !editMode) return null

          return (
            <WidgetWrapper
              key={widget.id}
              id={widget.id}
              index={idx}
              className={spanFull ? "col-span-2" : "col-span-2 lg:col-span-1"}
              onDragStart={(i) => setDragFrom(i)}
              onDragOver={() => {}}
              onDrop={() => {
                if (dragFrom !== null && dragFrom !== idx) {
                  reorder(dragFrom, idx)
                }
                setDragFrom(null)
              }}
            >
              {content ?? <div className="h-20 rounded-xl bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">No data</div>}
            </WidgetWrapper>
          )
        })}
      </div>
    </div>
  )
}
