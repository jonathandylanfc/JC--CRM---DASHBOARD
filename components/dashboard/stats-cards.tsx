"use client"

import { ArrowUpRight, TrendingUp, TrendingDown, CheckSquare, BookOpen } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useState } from "react"

interface StatsCardsProps {
  totalTasks: number
  tasksDone: number
  assignmentsDue: number
  monthlyIncome: number
  monthlyExpenses: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function StatsCards({ totalTasks, tasksDone, assignmentsDue, monthlyIncome, monthlyExpenses }: StatsCardsProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  const completionPct = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0

  const stats = [
    {
      title: "Total Tasks",
      value: String(totalTasks),
      subtitle: `${completionPct}% done`,
      Icon: CheckSquare,
      bgColor: "bg-primary",
      textColor: "text-primary-foreground",
      delay: "0ms",
    },
    {
      title: "Assignments Due",
      value: String(assignmentsDue),
      subtitle: "pending or in progress",
      Icon: BookOpen,
      bgColor: "bg-card",
      textColor: "text-foreground",
      delay: "100ms",
    },
    {
      title: "Income",
      value: currency(monthlyIncome),
      subtitle: "this month",
      Icon: TrendingUp,
      bgColor: "bg-card",
      textColor: "text-foreground",
      delay: "200ms",
    },
    {
      title: "Expenses",
      value: currency(monthlyExpenses),
      subtitle: "this month",
      Icon: TrendingDown,
      bgColor: "bg-card",
      textColor: "text-foreground",
      delay: "300ms",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, index) => (
        <Card
          key={stat.title}
          onMouseEnter={() => setHoveredCard(index)}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ animationDelay: stat.delay }}
          className={`${stat.bgColor} ${stat.textColor} p-4 transition-all duration-500 ease-out animate-slide-in-up cursor-pointer ${
            hoveredCard === index ? "scale-105 shadow-2xl" : "shadow-lg"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-xs font-medium opacity-90">{stat.title}</h3>
            <div
              className={`w-6 h-6 rounded-full ${
                stat.bgColor === "bg-primary" ? "bg-primary-foreground/20" : "bg-primary"
              } flex items-center justify-center transition-transform duration-300 ${
                hoveredCard === index ? "rotate-45" : ""
              }`}
            >
              <ArrowUpRight
                className="w-3 h-3 text-primary-foreground"
              />
            </div>
          </div>
          <p className="text-3xl font-bold mb-2">{stat.value}</p>
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <stat.Icon className="w-3 h-3" />
            <span>{stat.subtitle}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}
