"use client"

import { ArrowUpRight, TrendingUp, TrendingDown, CheckSquare, DollarSign } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useState } from "react"
import Link from "next/link"

interface StatsCardsProps {
  totalTasks: number
  tasksDone: number
  tasksDueToday: number
  monthlyIncome: number
  monthlyExpenses: number
  lastMonthIncome: number
  lastMonthExpenses: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function StatsCards({ totalTasks, tasksDone, tasksDueToday, monthlyIncome, monthlyExpenses, lastMonthIncome, lastMonthExpenses }: StatsCardsProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  const netBalance = monthlyIncome - monthlyExpenses

  const expensePct = pctChange(monthlyExpenses, lastMonthExpenses)
  const incomePct = pctChange(monthlyIncome, lastMonthIncome)

  const lastMonthName = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    .toLocaleString("en-US", { month: "short" })

  const stats = [
    {
      title: "Open Tasks",
      value: String(totalTasks),
      subtitle: tasksDueToday > 0 ? `${tasksDueToday} due today` : "none due today",
      badge: null,
      Icon: CheckSquare,
      bgColor: "bg-primary",
      textColor: "text-primary-foreground",
      delay: "0ms",
      href: "/tasks",
    },
    {
      title: "Income",
      value: currency(monthlyIncome),
      subtitle: "this month",
      badge: incomePct !== null ? {
        label: `${incomePct >= 0 ? "+" : ""}${incomePct}% vs ${lastMonthName}`,
        positive: incomePct >= 0,
      } : null,
      Icon: TrendingUp,
      bgColor: "bg-card",
      textColor: "text-foreground",
      delay: "100ms",
      href: "/finance",
    },
    {
      title: "Expenses",
      value: currency(monthlyExpenses),
      subtitle: "this month",
      badge: expensePct !== null ? {
        label: `${expensePct >= 0 ? "+" : ""}${expensePct}% vs ${lastMonthName}`,
        positive: expensePct <= 0, // spending less = positive
      } : null,
      Icon: TrendingDown,
      bgColor: "bg-card",
      textColor: "text-foreground",
      delay: "200ms",
      href: "/finance",
    },
    {
      title: "Net Balance",
      value: currency(Math.abs(netBalance)),
      subtitle: netBalance >= 0 ? "surplus this month" : "deficit this month",
      badge: null,
      Icon: DollarSign,
      bgColor: "bg-card",
      textColor: netBalance >= 0 ? "text-emerald-500" : "text-rose-500",
      delay: "300ms",
      href: "/finance",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, index) => (
        <Link key={stat.title} href={stat.href} className="block h-full">
          <Card
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
            style={{ animationDelay: stat.delay }}
            className={`${stat.bgColor} ${stat.textColor} h-full p-3 sm:p-4 flex flex-col justify-between transition-all duration-300 animate-slide-in-up cursor-pointer ${
              hoveredCard === index ? "scale-[1.02] shadow-2xl" : "shadow-md"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] sm:text-xs font-medium opacity-80">{stat.title}</h3>
              <div className={`w-5 h-5 rounded-full shrink-0 ${
                stat.bgColor === "bg-primary" ? "bg-primary-foreground/20" : "bg-primary"
              } flex items-center justify-center`}>
                <ArrowUpRight className="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold leading-none mb-1.5">{stat.value}</p>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs opacity-70">
                <stat.Icon className="w-3 h-3 shrink-0" />
                <span>{stat.subtitle}</span>
              </div>
              {stat.badge && (
                <div className={`mt-1.5 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  stat.badge.positive
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                }`}>
                  {stat.badge.label}
                </div>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
