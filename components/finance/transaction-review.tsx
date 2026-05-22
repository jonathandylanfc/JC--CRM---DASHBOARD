"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, TrendingUp, TrendingDown, ArrowLeftRight, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { approveTransaction, snoozeTransaction, approveAllVisible } from "@/app/finance/actions"
import { format } from "date-fns"

interface Transaction {
  id: string
  title: string
  amount: number
  type: string
  category: string
  date: string
  account_name: string | null
  reviewed: boolean
  snoozed_until: string | null
}

interface Props {
  transactions: Transaction[]
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function TransactionReview({ transactions }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const now = new Date()

  // Filter to only unreviewed + not currently snoozed
  const queue = transactions.filter(
    (tx) =>
      !tx.reviewed &&
      !dismissed.has(tx.id) &&
      (!tx.snoozed_until || new Date(tx.snoozed_until) <= now)
  )

  if (queue.length === 0) return null

  function handleApprove(id: string) {
    setDismissed((prev) => new Set(prev).add(id))
    startTransition(async () => {
      const result = await approveTransaction(id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleSnooze(id: string) {
    setDismissed((prev) => new Set(prev).add(id))
    startTransition(async () => {
      const result = await snoozeTransaction(id, 24)
      if (result.error) toast.error(result.error)
      else {
        toast.info("We'll remind you tomorrow")
        router.refresh()
      }
    })
  }

  function handleApproveAll() {
    const ids = queue.map((tx) => tx.id)
    setDismissed((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    startTransition(async () => {
      const result = await approveAllVisible(ids)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`${ids.length} transaction${ids.length !== 1 ? "s" : ""} approved`)
        router.refresh()
      }
    })
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/10 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Review Transactions
              <Badge className="ml-2 bg-amber-500 text-white text-[10px] h-4 px-1.5">{queue.length}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">Do you recognize these? Approve or come back later.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex gap-1.5 bg-transparent border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-xs h-7"
            onClick={(e) => { e.stopPropagation(); handleApproveAll() }}
            disabled={isPending}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve All
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Transaction list */}
      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-800">
          {/* Mobile approve all */}
          <div className="sm:hidden p-3 border-b border-amber-200 dark:border-amber-800">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 bg-transparent border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
              onClick={handleApproveAll}
              disabled={isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve All {queue.length} Transactions
            </Button>
          </div>

          <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
            {queue.map((tx) => {
              const isIncome = tx.type === "income"
              const isTransfer = tx.type === "transfer"
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    isTransfer
                      ? "bg-muted text-muted-foreground"
                      : isIncome
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                  }`}>
                    {isTransfer ? <ArrowLeftRight className="w-4 h-4" /> : isIncome ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{tx.category}</span>
                      {" · "}
                      {format(new Date(tx.date + "T12:00:00"), "MMM d")}
                      {tx.account_name && <span className="text-primary/70"> · {tx.account_name.split(" – ")[0]}</span>}
                    </p>
                  </div>

                  {/* Amount */}
                  <p className={`text-sm font-semibold shrink-0 ${
                    isTransfer ? "text-muted-foreground" : isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}>
                    {isIncome ? "+" : isTransfer ? "" : "-"}{currency(tx.amount)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      className="h-7 px-2.5 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(tx.id)}
                      disabled={isPending}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Approve</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 gap-1 text-xs bg-transparent"
                      onClick={() => handleSnooze(tx.id)}
                      disabled={isPending}
                      title="Remind me in 24 hours"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Later</span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
