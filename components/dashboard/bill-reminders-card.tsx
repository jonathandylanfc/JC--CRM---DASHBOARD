import { Card } from "@/components/ui/card"
import { Bell } from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"

interface Subscription {
  id: string
  name: string
  amount: number
  billing_cycle: string
  next_billing_date: string
  category: string | null
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function BillRemindersCard({ subscriptions }: { subscriptions: Subscription[] }) {
  if (subscriptions.length === 0) return null

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-amber-500" />
        <h3 className="font-semibold text-sm text-foreground">Upcoming Bills</h3>
        <span className="text-xs text-muted-foreground ml-auto">next 7 days</span>
      </div>
      <div className="space-y-2">
        {subscriptions.map((sub) => {
          const daysUntil = differenceInDays(parseISO(sub.next_billing_date), new Date())
          const urgent = daysUntil <= 2
          return (
            <div key={sub.id} className={`flex items-center justify-between p-2.5 rounded-lg ${urgent ? "bg-rose-50 dark:bg-rose-950/20" : "bg-muted/40"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{sub.name}</p>
                <p className="text-xs text-muted-foreground">
                  {daysUntil === 0 ? "Due today" : daysUntil === 1 ? "Due tomorrow" : `Due in ${daysUntil} days`}
                  {" · "}{format(parseISO(sub.next_billing_date), "MMM d")}
                </p>
              </div>
              <p className={`text-sm font-semibold tabular-nums shrink-0 ml-3 ${urgent ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                {currency(Number(sub.amount))}
              </p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
