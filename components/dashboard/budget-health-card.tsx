import Link from "next/link"
import { Card } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

interface BudgetCategory {
  id: string
  name: string
  type: string
  value: number
  is_catchall?: boolean
  linked_account?: string | null
  rollover?: boolean
}

interface BudgetHealthCardProps {
  categories: BudgetCategory[]
  expensesByCategory: Record<string, number>
  monthlyIncome: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function BudgetHealthCard({ categories, expensesByCategory, monthlyIncome }: BudgetHealthCardProps) {
  // Only expense-type budget categories
  const expenseCats = categories.filter((c) => c.type === "expense" && c.value > 0)

  const totalBudgeted = expenseCats.reduce((sum, c) => sum + c.value, 0)
  const totalSpent = expenseCats.reduce((sum, c) => sum + (expensesByCategory[c.name.toLowerCase()] ?? 0), 0)
  const overallPct = totalBudgeted > 0 ? Math.min(Math.round((totalSpent / totalBudgeted) * 100), 100) : 0

  // Top 3 categories by spending
  const top3 = [...expenseCats]
    .sort((a, b) => {
      const aSpent = expensesByCategory[a.name.toLowerCase()] ?? 0
      const bSpent = expensesByCategory[b.name.toLowerCase()] ?? 0
      return bSpent - aSpent
    })
    .slice(0, 3)

  const overBudget = expenseCats.filter((c) => {
    const spent = expensesByCategory[c.name.toLowerCase()] ?? 0
    return spent > c.value
  })

  return (
    <Card className="p-5 transition-all duration-500 hover:shadow-xl animate-slide-in-up" style={{ animationDelay: "300ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Budget</h2>
        <Link href="/budget" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>

      {/* Overall bar */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Overall</span>
          <span className="text-xs font-medium text-foreground">{overallPct}% used</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              overallPct >= 100 ? "bg-rose-500" : overallPct >= 75 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">{currency(totalSpent)} spent</span>
          <span className="text-xs text-muted-foreground">{currency(totalBudgeted)} budgeted</span>
        </div>
      </div>

      {/* Top categories */}
      {top3.length > 0 && (
        <div className="space-y-3">
          {top3.map((cat) => {
            const spent = expensesByCategory[cat.name.toLowerCase()] ?? 0
            const pct = cat.value > 0 ? Math.min(Math.round((spent / cat.value) * 100), 100) : 0
            const color = pct >= 100 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"
            const textColor = pct >= 100 ? "text-rose-500" : pct >= 75 ? "text-amber-500" : "text-emerald-500"
            return (
              <div key={cat.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-foreground font-medium truncate mr-2">{cat.name}</span>
                  <span className={`text-xs font-medium whitespace-nowrap ${textColor}`}>{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currency(spent)} / {currency(cat.value)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {expenseCats.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No budget categories set up.</p>
      )}

      {/* Over-budget warning */}
      {overBudget.length > 0 && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-500">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>
            {overBudget.length} {overBudget.length === 1 ? "category" : "categories"} over budget
          </span>
        </div>
      )}
    </Card>
  )
}
