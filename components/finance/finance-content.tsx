"use client"

import { useState, useTransition, useOptimistic, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  AlertTriangle,
  CheckSquare,
  X,
  Filter,
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  createTransaction,
  deleteTransaction,
  deleteAllTransactions,
  deleteSelectedTransactions,
  getTransactionCount,
} from "@/app/finance/actions"
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
  initialStartingBalance: number
}

function formatDate(dateStr: string) {
  return format(new Date(dateStr + "T12:00:00"), "MMM d, yyyy")
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

type OptimisticAction =
  | { type: "add"; tx: Transaction }
  | { type: "delete"; id: string }
  | { type: "deleteMany"; ids: string[] }

type DateRange = "this_month" | "last_3_months" | "last_6_months" | "last_year" | "all_time"

const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "this_month", label: "This Month" },
  { value: "last_3_months", label: "3 Months" },
  { value: "last_6_months", label: "6 Months" },
  { value: "last_year", label: "Last Year" },
  { value: "all_time", label: "All Time" },
]

function getDateBounds(range: DateRange): { start: string | null; end: string | null } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = toISO(now)

  switch (range) {
    case "this_month": {
      const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start, end: toISO(last) }
    }
    case "last_3_months": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3)
      return { start: toISO(d), end: today }
    }
    case "last_6_months": {
      const d = new Date(now); d.setMonth(d.getMonth() - 6)
      return { start: toISO(d), end: today }
    }
    case "last_year": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
      return { start: toISO(d), end: today }
    }
    case "all_time":
      return { start: null, end: null }
  }
}

export function FinanceContent({
  initialTransactions,
  initialSubscriptions,
  monthlyIncome,
  monthlyExpenses,
  initialStartingBalance,
}: FinanceContentProps) {
  const router = useRouter()

  // Add-transaction dialog
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Clear-all
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [isClearing, startClearing] = useTransition()
  const [realCount, setRealCount] = useState<number | null>(null)

  // Select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false)
  const [isDeletingSelected, startDeletingSelected] = useTransition()

  const [optimisticTransactions, updateOptimistic] = useOptimistic(
    initialTransactions,
    (state: Transaction[], action: OptimisticAction) => {
      if (action.type === "add") return [action.tx, ...state]
      if (action.type === "delete") return state.filter((t) => t.id !== action.id)
      if (action.type === "deleteMany") return state.filter((t) => !action.ids.includes(t.id))
      return state
    },
  )

  // Real DB row returned after a manual add — pinned at top permanently until next page load
  const [savedTx, setSavedTx] = useState<Transaction | null>(null)

  // Date-range and category filters
  const [dateRange, setDateRange] = useState<DateRange>("this_month")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [startingBalance] = useState(initialStartingBalance)

  const allCategories = useMemo(() => {
    const cats = new Set(optimisticTransactions.map((tx) => tx.category))
    return Array.from(cats).sort()
  }, [optimisticTransactions])

  const { filteredIncome, filteredExpenses, filteredNet } = useMemo(() => {
    const { start, end } = getDateBounds(dateRange)
    const filtered = optimisticTransactions.filter((tx) => {
      if (start && tx.date < start) return false
      if (end && tx.date > end) return false
      if (selectedCategory && tx.category !== selectedCategory) return false
      return true
    })
    const income = filtered
      .filter((tx) => tx.type === "income")
      .reduce((s, tx) => s + Number(tx.amount), 0)
    const expenses = filtered
      .filter((tx) => tx.type === "expense")
      .reduce((s, tx) => s + Number(tx.amount), 0)
    const base = dateRange === "all_time" && !selectedCategory ? startingBalance : 0
    return { filteredIncome: income, filteredExpenses: expenses, filteredNet: base + income - expenses }
  }, [optimisticTransactions, dateRange, startingBalance, selectedCategory])

  // Keep the just-saved transaction at the top regardless of sort order or limit windows.
  // Uses the real DB row (not the optimistic placeholder) so the UUID always matches
  // after router.refresh() brings in the authoritative initialTransactions.
  const displayTransactions = useMemo(() => {
    let list = optimisticTransactions
    if (savedTx) {
      const stillExists = optimisticTransactions.some((tx) => tx.id === savedTx.id)
      if (stillExists) {
        const rest = optimisticTransactions.filter((tx) => tx.id !== savedTx.id)
        list = [savedTx, ...rest]
      }
    }
    if (selectedCategory) list = list.filter((tx) => tx.category === selectedCategory)
    return list
  }, [optimisticTransactions, savedTx, selectedCategory])

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      updateOptimistic({ type: "delete", id })
      await deleteTransaction(id)
      if (savedTx?.id === id) setSavedTx(null)
      router.refresh()
    })
  }

  async function openClearAllDialog() {
    setRealCount(null)
    setConfirmClearOpen(true)
    const count = await getTransactionCount()
    setRealCount(count)
  }

  function handleClearAll() {
    startClearing(async () => {
      const result = await deleteAllTransactions()
      setConfirmClearOpen(false)
      setRealCount(null)
      if (result.error) { toast.error(result.error); return }
      toast.success("All transactions deleted")
      exitSelectMode()
      router.refresh()
    })
  }

  function handleDeleteSelected() {
    const ids = [...selectedIds]
    startDeletingSelected(async () => {
      updateOptimistic({ type: "deleteMany", ids })
      const result = await deleteSelectedTransactions(ids)
      setConfirmDeleteSelectedOpen(false)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${ids.length} transaction${ids.length !== 1 ? "s" : ""} deleted`)
      exitSelectMode()
      router.refresh()
    })
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const id = crypto.randomUUID()
    fd.set("id", id)
    const tempTx: Transaction = {
      id,
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
      if (result?.error) {
        toast.error(result.error)
      } else if (result?.transaction) {
        const tx = result.transaction
        const saved: Transaction = {
          id: tx.id,
          title: tx.title,
          amount: Number(tx.amount),
          type: tx.type,
          category: tx.category,
          date: tx.date,
          notes: tx.notes ?? null,
        }
        setSavedTx(saved)
        setDateRange("all_time")
        toast.success(`"${tempTx.title}" saved`)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Date range selector */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {DATE_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setDateRange(r.value)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              dateRange === r.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Income</p>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{currency(filteredIncome)}</p>
        </Card>

        <Card className="p-5 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Expenses</p>
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-800 dark:text-rose-300">{currency(filteredExpenses)}</p>
        </Card>

        <Card
          className={`p-5 ${
            filteredNet >= 0
              ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
              : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-medium ${filteredNet >= 0 ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>
              Net Balance
            </p>
            <DollarSign className={`w-4 h-4 ${filteredNet >= 0 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`} />
          </div>
          <p className={`text-2xl font-bold ${filteredNet >= 0 ? "text-blue-800 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>
            {filteredNet >= 0 ? "+" : ""}{currency(filteredNet)}
          </p>
        </Card>
      </div>

      {/* Transactions + Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground shrink-0">Transactions</h2>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!selectMode ? (
                /* ── Normal mode buttons ─────────────────────────── */
                <>
                  {/* Category filter */}
                  <Select
                    value={selectedCategory ?? "all"}
                    onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}
                  >
                    <SelectTrigger size="sm" className={`w-auto gap-1.5 bg-transparent text-xs ${selectedCategory ? "border-primary text-primary" : ""}`}>
                      <Filter className="w-3.5 h-3.5 shrink-0" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {allCategories.map((cat) => (
                        <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <CsvImporter />

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-transparent"
                    onClick={() => setSelectMode(true)}
                  >
                    <CheckSquare className="w-4 h-4" />
                    Select
                  </Button>

                  {/* Add Transaction dialog */}
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
                          <Input id="tx-title" name="title" placeholder="e.g. Grocery shopping" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="tx-amount">Amount ($)</Label>
                            <Input id="tx-amount" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="tx-type">Type</Label>
                            <Select name="type" defaultValue="expense">
                              <SelectTrigger id="tx-type"><SelectValue /></SelectTrigger>
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
                            <Input id="tx-category" name="category" placeholder="e.g. Food" required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="tx-date">Date</Label>
                            <Input id="tx-date" name="date" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="tx-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                          <Input id="tx-notes" name="notes" placeholder="Additional notes…" />
                        </div>
                        {formError && <p className="text-sm text-destructive">{formError}</p>}
                        <div className="flex gap-3 pt-1">
                          <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                          <Button type="submit" className="flex-1" disabled={isPending}>
                            {isPending ? "Saving…" : "Save Transaction"}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                /* ── Select mode buttons ─────────────────────────── */
                <>
                  {/* Clear All */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={openClearAllDialog}
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All
                  </Button>

                  <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-5 h-5" />
                          Delete all transactions?
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-2">
                        <p className="text-sm text-muted-foreground">
                          This will permanently delete{" "}
                          <span className="font-semibold text-foreground">
                            all {realCount ?? "…"} transaction
                            {(realCount ?? 2) !== 1 ? "s" : ""}
                          </span>{" "}
                          for your account. This cannot be undone.
                        </p>
                        <div className="flex gap-3">
                          <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmClearOpen(false)} disabled={isClearing}>Cancel</Button>
                          <Button variant="destructive" className="flex-1" onClick={handleClearAll} disabled={isClearing}>
                            {isClearing ? "Deleting…" : "Yes, delete all"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Delete Selected */}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={selectedIds.size === 0}
                    onClick={() => setConfirmDeleteSelectedOpen(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete {selectedIds.size > 0 ? selectedIds.size : ""} Selected
                  </Button>

                  {/* Cancel select mode */}
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exitSelectMode}>
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Delete Selected confirmation dialog */}
          <Dialog open={confirmDeleteSelectedOpen} onOpenChange={setConfirmDeleteSelectedOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Delete {selectedIds.size} selected transaction{selectedIds.size !== 1 ? "s" : ""}?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete the selected transactions. This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteSelectedOpen(false)} disabled={isDeletingSelected}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleDeleteSelected} disabled={isDeletingSelected}>
                    {isDeletingSelected ? "Deleting…" : `Delete ${selectedIds.size}`}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Transaction list */}
          {displayTransactions.length === 0 ? (
            <Card className="p-8 text-center">
              <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {selectedCategory ? `No transactions in "${selectedCategory}"` : "No transactions yet"}
              </p>
              {!selectedCategory && (
                <Button size="sm" className="mt-3 gap-2" onClick={() => setOpen(true)}>
                  <Plus className="w-4 h-4" />
                  Add your first transaction
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-2">
              {displayTransactions.map((tx) => {
                const isSelected = selectedIds.has(tx.id)
                return (
                  <Card
                    key={tx.id}
                    onClick={selectMode ? () => toggleSelect(tx.id) : undefined}
                    className={`p-4 transition-all duration-200 ${
                      selectMode
                        ? `cursor-pointer hover:bg-muted/40 ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`
                        : "group hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {selectMode && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(tx.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                      )}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          tx.type === "income"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}
                      >
                        {tx.type === "income" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{tx.title}</p>
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
                        <span className={`font-semibold text-sm ${tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {tx.type === "income" ? "+" : "-"}{currency(Number(tx.amount))}
                        </span>
                        {!selectMode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(tx.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Subscriptions */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Active Subscriptions</h2>
          {initialSubscriptions.length === 0 ? (
            <Card className="p-6 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No active subscriptions</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {initialSubscriptions.map((sub) => (
                <Card key={sub.id} className="p-4 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{sub.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{sub.billing_cycle}</span>
                        <span>·</span>
                        <span>Next: {formatDate(sub.next_billing_date)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-foreground text-sm">{currency(Number(sub.amount))}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize mt-0.5">
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
