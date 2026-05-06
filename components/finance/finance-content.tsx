"use client"

import { useState, useTransition, useOptimistic } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Trash2,
  CalendarDays,
  CreditCard,
} from "lucide-react"
import { format } from "date-fns"
import { createTransaction, deleteTransaction } from "@/app/finance/actions"
import { CsvImporter } from "@/components/finance/csv-importer"

interface Transaction {
  id: string
  title: string
  amount: number
  type: string
  category: string
  date: string
  notes: string | null
}

interface Subscription {
  id: string
  name: string
  amount: number
  billing_cycle: string
  next_billing_date: string
  category: string
  active: boolean
}

interface FinanceContentProps {
  initialTransactions: Transaction[]
  initialSubscriptions: Subscription[]
  monthlyIncome: number
  monthlyExpenses: number
}

function formatDate(dateStr: string) {
  return format(new Date(dateStr + "T12:00:00"), "MMM d, yyyy")
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n)
}

type OptimisticAction =
  | { type: "add"; tx: Transaction }
  | { type: "delete"; id: string }

export function FinanceContent({
  initialTransactions,
  initialSubscriptions,
  monthlyIncome,
  monthlyExpenses,
}: FinanceContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [optimisticTransactions, updateOptimistic] = useOptimistic(
    initialTransactions,
    (state: Transaction[], action: OptimisticAction) => {
      if (action.type === "add") return [action.tx, ...state]
      if (action.type === "delete") return state.filter((t) => t.id !== action.id)
      return state
    },
  )

  const netBalance = monthlyIncome - monthlyExpenses

  function handleDelete(id: string) {
    startTransition(async () => {
      updateOptimistic({ type: "delete", id })
      await deleteTransaction(id)
      router.refresh()
    })
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)

    const tempTx: Transaction = {
      id: crypto.randomUUID(),
      title: fd.get("title") as string,
      amount: parseFloat(fd.get("amount") as string),
      type: fd.get("type") as string,
      category: (fd.get("category") as string) || "other",
      date: (fd.get("date") as string) || new Date().toISOString().split("T")[0],
      notes: (fd.get("notes") as string) || null,
    }

    setOpen(false)
    startTransition(async () => {
      updateOptimistic({ type: "add", tx: tempTx })
      const result = await createTransaction(fd)
      if (result?.error) setFormError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Income This Month
            </p>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">
            {currency(monthlyIncome)}
          </p>
        </Card>

        <Card className="p-5 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
              Expenses This Month
            </p>
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-800 dark:text-rose-300">
            {currency(monthlyExpenses)}
          </p>
        </Card>

        <Card
          className={`p-5 ${
            netBalance >= 0
              ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
              : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p
              className={`text-sm font-medium ${
                netBalance >= 0
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
            >
              Net Balance
            </p>
            <DollarSign
              className={`w-4 h-4 ${
                netBalance >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            />
          </div>
          <p
            className={`text-2xl font-bold ${
              netBalance >= 0
                ? "text-blue-800 dark:text-blue-300"
                : "text-amber-800 dark:text-amber-300"
            }`}
          >
            {netBalance >= 0 ? "+" : ""}
            {currency(netBalance)}
          </p>
        </Card>
      </div>

      {/* Transactions + Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Transactions</h2>

            <div className="flex items-center gap-2">
              <CsvImporter />

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Transaction
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tx-title">Title</Label>
                    <Input
                      id="tx-title"
                      name="title"
                      placeholder="e.g. Grocery shopping"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-amount">Amount ($)</Label>
                      <Input
                        id="tx-amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-type">Type</Label>
                      <Select name="type" defaultValue="expense">
                        <SelectTrigger id="tx-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-category">Category</Label>
                      <Input
                        id="tx-category"
                        name="category"
                        placeholder="e.g. Food"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-date">Date</Label>
                      <Input
                        id="tx-date"
                        name="date"
                        type="date"
                        defaultValue={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tx-notes">
                      Notes{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="tx-notes"
                      name="notes"
                      placeholder="Additional notes…"
                    />
                  </div>
                  {formError && (
                    <p className="text-sm text-destructive">{formError}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-transparent"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isPending}>
                      {isPending ? "Saving…" : "Save Transaction"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {optimisticTransactions.length === 0 ? (
            <Card className="p-8 text-center">
              <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
              <Button
                size="sm"
                className="mt-3 gap-2"
                onClick={() => setOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add your first transaction
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {optimisticTransactions.map((tx) => (
                <Card
                  key={tx.id}
                  className="p-4 group hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        tx.type === "income"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                      }`}
                    >
                      {tx.type === "income" ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {tx.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{tx.category}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDate(tx.date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-semibold text-sm ${
                          tx.type === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {tx.type === "income" ? "+" : "-"}
                        {currency(Number(tx.amount))}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(tx.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Subscriptions */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Active Subscriptions
          </h2>
          {initialSubscriptions.length === 0 ? (
            <Card className="p-6 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No active subscriptions
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {initialSubscriptions.map((sub) => (
                <Card
                  key={sub.id}
                  className="p-4 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {sub.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{sub.billing_cycle}</span>
                        <span>·</span>
                        <span>
                          Next:{" "}
                          {formatDate(sub.next_billing_date)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-foreground text-sm">
                        {currency(Number(sub.amount))}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 capitalize mt-0.5"
                      >
                        {sub.category}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
