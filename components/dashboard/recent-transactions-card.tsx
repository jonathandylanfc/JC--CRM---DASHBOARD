import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Receipt } from "lucide-react"

interface Transaction {
  id: string
  title: string
  amount: number
  type: string
  category: string
  date: string
  account_name?: string | null
}

interface RecentTransactionsCardProps {
  transactions: Transaction[]
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function RecentTransactionsCard({ transactions }: RecentTransactionsCardProps) {
  return (
    <Card className="p-5 transition-all duration-500 hover:shadow-xl animate-slide-in-up" style={{ animationDelay: "400ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Recent Transactions</h2>
        <Link href="/finance" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <Receipt className="w-8 h-8 text-primary/30" />
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.slice(0, 5).map((tx) => {
            const amountColor =
              tx.type === "income"
                ? "text-emerald-500"
                : tx.type === "transfer"
                ? "text-muted-foreground"
                : "text-rose-500"
            const amountPrefix = tx.type === "income" ? "+" : tx.type === "transfer" ? "" : "-"

            return (
              <div key={tx.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium whitespace-nowrap">
                  {tx.category}
                </span>
                <span className={`text-sm font-semibold whitespace-nowrap ${amountColor}`}>
                  {amountPrefix}{currency(Math.abs(Number(tx.amount)))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
