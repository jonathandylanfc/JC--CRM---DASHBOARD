import Link from "next/link"
import { Card } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

interface BudgetCategory {
  id: string
  name: string
  type: string
  value: number
  is_catchall?: boolean
  is_goal_mode?: boolean
  linked_account?: string | null
  rollover?: boolean
  category_aliases?: string | null
}

interface BudgetHealthCardProps {
  categories: BudgetCategory[]
  expensesByCategory: Record<string, number>
  monthlyIncome: number
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function getCatKeys(cat: BudgetCategory): string[] {
  const name = cat.name.toLowerCase()
  const aliases = (cat.category_aliases ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
  return [name, ...aliases]
}

export function BudgetHealthCard({ categories, expensesByCategory, monthlyIncome }: BudgetHealthCardProps) {
  const expenseCats = categories
    .filter((c) => c.value > 0)
    .map((c) => ({
      ...c,
      dollarValue: c.type === "percentage"
        ? (c.value / 100) * monthlyIncome
        : c.value,
    }))

  // Mirror Budget page catchall logic
  const namedCats = expenseCats.filter((c) => !c.is_catchall)
  const namedSpending = namedCats.reduce(
    (sum, c) => sum + getCatKeys(c).reduce((s, k) => s + (expensesByCategory[k] ?? 0), 0),
    0,
  )
  const totalExpensesSum = Object.values(expensesByCategory).reduce((s, v) => s + v, 0)
  const catchallSpending = Math.max(0, totalExpensesSum - namedSpending)

  function spentFor(cat: typeof expenseCats[number]): number {
    if (cat.is_catchall) return catchallSpending
    return getCatKeys(cat).reduce((s, k) => s + (expensesByCategory[k] ?? 0), 0)
  }

  const totalBudgeted = expenseCats.reduce((sum, c) => sum + c.dollarValue, 0)
  const totalSpent = expenseCats.reduce((sum, c) => sum + spentFor(c), 0)
  const overallPct = totalBudgeted > 0 ? Math.min(Math.round((totalSpent / totalBudgeted) * 100), 100) : 0

  const top3 = [...expenseCats]
    .sort((a, b) => spentFor(b) - spentFor(a))
    .slice(0, 3)

  const overBudget = expenseCats.filter((c) => {
    if (c.is_goal_mode) return false
    return spentFor(c) > c.dollarValue
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
            const spent = spentFor(cat)
            const pct = cat.dollarValue > 0 ? Math.min(Math.round((spent / cat.dollarValue) * 100), 100) : 0
            const color = cat.is_goal_mode
              ? (pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-500")
              : (pct >= 100 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500")
            const textColor = cat.is_goal_mode
              ? (pct >= 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500")
              : (pct >= 100 ? "text-rose-500" : pct >= 75 ? "text-amber-500" : "text-emerald-500")
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
                  {currency(spent)} / {currency(cat.dollarValue)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {top3.length === 0 && (
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
