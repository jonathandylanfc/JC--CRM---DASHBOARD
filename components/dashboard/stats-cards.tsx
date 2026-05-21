"use client"

import { ArrowUpRight, TrendingUp, TrendingDown, CheckSquare, DollarSign } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useState } from "react"
import Link from "next/link"

interface StatsCardsProps {
  totalTasks: number
  tasksDone: number
  monthlyIncome: number
  monthlyExpenses: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function StatsCards({ totalTasks, tasksDone, monthlyIncome, monthlyExpenses }: StatsCardsProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  const completionPct = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0
  const netBalance = monthlyIncome - monthlyExpenses

  const stats = [
    {
      title: "Total Tasks",
      value: String(totalTasks),
      subtitle: `${completionPct}% done`,
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
        <Link key={stat.title} href={stat.href}>
          <Card
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
            style={{ animationDelay: stat.delay }}
            className={`${stat.bgColor} ${stat.textColor} p-3 sm:p-4 transition-all duration-500 ease-out animate-slide-in-up cursor-pointer ${
              hoveredCard === index ? "scale-105 shadow-2xl" : "shadow-lg"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-[11px] sm:text-xs font-medium opacity-90 leading-tight">{stat.title}</h3>
              <div
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full shrink-0 ${
                  stat.bgColor === "bg-primary" ? "bg-primary-foreground/20" : "bg-primary"
                } flex items-center justify-center transition-transform duration-300 ${
                  hoveredCard === index ? "rotate-45" : ""
                }`}
              >
                <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary-foreground" />
              </div>
            </div>
            <p className="text-lg sm:text-3xl font-bold mb-1.5 truncate">{stat.value}</p>
            <div className="flex items-center gap-1 text-[10px] sm:text-xs opacity-80">
              <stat.Icon className="w-3 h-3 shrink-0" />
              <span className="truncate">{stat.subtitle}</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
