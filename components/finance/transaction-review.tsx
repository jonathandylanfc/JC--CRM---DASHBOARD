"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, TrendingUp, TrendingDown, ArrowLeftRight, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { approveTransaction, approveTransactionWithCategory, approveTransactionWithCategoryAlways, snoozeTransaction, approveAllVisible } from "@/app/finance/actions"
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

interface BudgetCategory {
  id: string
  name: string
}

interface Props {
  transactions: Transaction[]
  budgetCategories?: BudgetCategory[]
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

const GROCERY_RE = /grocer|food|shoppin|walmart|target|market|superm/i
const GAS_RE = /\bgas\b|fuel|\bcar\b|auto|vehicle|transport/i

function bestCat(cats: BudgetCategory[], re: RegExp, fallback: string) {
  return cats.find(c => re.test(c.name))?.name ?? fallback
}

export function TransactionReview({ transactions, budgetCategories = [] }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [recatTxId, setRecatTxId] = useState<string | null>(null)
  const [recatDest, setRecatDest] = useState<string | null>(null)

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

  function handleApproveWithCategory(id: string, category: string) {
    setDismissed((prev) => new Set(prev).add(id))
    startTransition(async () => {
      const result = await approveTransactionWithCategory(id, category)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleRecatJustOne(tx: Transaction, category: string) {
    setDismissed((prev) => new Set(prev).add(tx.id))
    setRecatTxId(null)
    setRecatDest(null)
    startTransition(async () => {
      const result = await approveTransactionWithCategory(tx.id, category)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Moved to ${category}`)
        router.refresh()
      }
    })
  }

  function handleRecatAlways(tx: Transaction, category: string) {
    setDismissed((prev) => new Set(prev).add(tx.id))
    setRecatTxId(null)
    setRecatDest(null)
    startTransition(async () => {
      const result = await approveTransactionWithCategoryAlways(tx.id, tx.title, category)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`"${tx.title}" → ${category} (all future charges will auto-sort here)`)
        router.refresh()
      }
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
              const titleLower = tx.title.toLowerCase()
              const isCostcoAmbiguous =
                titleLower.includes("costco") &&
                !titleLower.includes("costco gas") &&
                !titleLower.includes("costco fuel")
              return (
                <div key={tx.id} className="px-4 py-3 space-y-2">
                  {/* Row 1: icon + title + amount */}
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isTransfer
                        ? "bg-muted text-muted-foreground"
                        : isIncome
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                    }`}>
                      {isTransfer ? <ArrowLeftRight className="w-4 h-4" /> : isIncome ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">{tx.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{tx.category}</span>
                        {" · "}
                        {format(new Date(tx.date + "T12:00:00"), "MMM d")}
                        {tx.account_name && <span className="text-primary/70"> · {tx.account_name.split(" – ")[0]}</span>}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold shrink-0 mt-0.5 tabular-nums ${
                      isTransfer ? "text-muted-foreground" : isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {isIncome ? "+" : isTransfer ? "" : "-"}{currency(tx.amount)}
                    </p>
                  </div>

                  {/* Row 2: action buttons (standard, non-Costco) */}
                  {!isCostcoAmbiguous && (
                    <div className="flex items-center gap-1.5 pl-12">
                      <Button
                        size="sm"
                        className="h-7 px-3 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApprove(tx.id)}
                        disabled={isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-7 px-2.5 text-xs bg-transparent ${recatTxId === tx.id ? "border-primary text-primary" : ""}`}
                        onClick={() => { setRecatTxId(recatTxId === tx.id ? null : tx.id); setRecatDest(null) }}
                        disabled={isPending}
                        title="Change category"
                      >
                        ↩ Move
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
                      </Button>
                    </div>
                  )}

                  {/* Inline re-categorize panel */}
                  {recatTxId === tx.id && !isCostcoAmbiguous && (
                    <div className="pl-12 space-y-2">
                      {recatDest ? (
                        /* Step 2: pick scope */
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Move to <span className="font-medium text-foreground">{recatDest}</span>. Apply to:</p>
                          <div className="flex flex-col gap-1.5">
                            <button
                              disabled={isPending}
                              onClick={() => handleRecatJustOne(tx, recatDest)}
                              className="w-full flex items-start gap-2 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-left"
                            >
                              <div>
                                <p className="text-xs font-medium">Just this charge</p>
                                <p className="text-[11px] text-muted-foreground">Other "{tx.title}" transactions stay where they are</p>
                              </div>
                            </button>
                            <button
                              disabled={isPending}
                              onClick={() => handleRecatAlways(tx, recatDest)}
                              className="w-full flex items-start gap-2 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-left"
                            >
                              <div>
                                <p className="text-xs font-medium">All "{tx.title}" charges — now and future</p>
                                <p className="text-[11px] text-muted-foreground">Every charge from this merchant auto-sorts here going forward</p>
                              </div>
                            </button>
                          </div>
                          <button className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2" onClick={() => setRecatDest(null)}>← back</button>
                        </div>
                      ) : (
                        /* Step 1: pick category */
                        <div className="flex flex-wrap gap-1.5">
                          {budgetCategories.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setRecatDest(c.name)}
                              className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/60 hover:bg-muted/40 transition-colors"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Costco disambiguation row */}
                  {isCostcoAmbiguous && (() => {
                    const groceryCat = bestCat(budgetCategories, GROCERY_RE, "Shopping")
                    const gasCat = bestCat(budgetCategories, GAS_RE, "Car")
                    return (
                    <div className="flex items-center gap-2 pl-12">
                      <span className="text-xs text-muted-foreground shrink-0">Costco — groceries or gas?</span>
                      <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApproveWithCategory(tx.id, groceryCat)}
                        disabled={isPending}
                      >
                        🛒 {groceryCat}
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                        onClick={() => handleApproveWithCategory(tx.id, gasCat)}
                        disabled={isPending}
                      >
                        ⛽ {gasCat}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 gap-1 text-xs bg-transparent ml-auto"
                        onClick={() => handleSnooze(tx.id)}
                        disabled={isPending}
                        title="Remind me in 24 hours"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Later</span>
                      </Button>
                    </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
