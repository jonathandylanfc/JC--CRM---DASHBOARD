import { Card } from "@/components/ui/card"
import { Target } from "lucide-react"
import Link from "next/link"

interface SavingsGoal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  color: string
  monthly_contribution_value: number | null
  monthly_contribution_type: string | null
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function WeeklyGoalsCard({ goals, monthlyIncome }: { goals: SavingsGoal[], monthlyIncome: number }) {
  const activeGoals = goals.slice(0, 4)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Savings Goals</h3>
        </div>
        <Link href="/budget" className="text-xs text-primary hover:opacity-70 transition-opacity">View all</Link>
      </div>

      {activeGoals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No savings goals yet — <Link href="/budget" className="text-primary underline underline-offset-2">create one</Link></p>
      ) : (
        <div className="space-y-4">
          {activeGoals.map((goal) => {
            const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0
            const monthly = goal.monthly_contribution_type === "fixed"
              ? goal.monthly_contribution_value ?? 0
              : goal.monthly_contribution_type === "percentage"
              ? (monthlyIncome * (goal.monthly_contribution_value ?? 0)) / 100
              : 0
            return (
              <div key={goal.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: goal.color }} />
                    <p className="text-sm font-medium text-foreground truncate">{goal.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0 ml-2">{pct.toFixed(0)}%</p>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: goal.color }} />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                  <span>{currency(goal.current_amount)} saved</span>
                  <span>{currency(goal.target_amount)} goal{monthly > 0 ? ` · ${currency(monthly)}/mo` : ""}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
