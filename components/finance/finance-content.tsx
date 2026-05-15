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
  Pencil,
  ChevronDown,
  Search,
  Download,
} from "lucide-react"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"
import { toast } from "sonner"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  deleteAccountTransactions,
  deleteSelectedTransactions,
  getTransactionCount,
} from "@/app/finance/actions"
import { CsvImporter } from "@/components/finance/csv-importer"
import { PlaidConnect } from "@/components/finance/plaid-connect"

interface Transaction {
  id: string
  title: string
  amount: number
  type: string
  category: string
  date: string
  notes: string | null
  balance: number | null
  account_name: string | null
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

interface BudgetCat {
  id: string
  name: string
  type: "percentage" | "fixed"
  value: number
}

interface FinanceContentProps {
  initialTransactions: Transaction[]
  initialSubscriptions: Subscription[]
  monthlyIncome: number
  monthlyExpenses: number
  initialStartingBalance: number
  budgetCategories?: BudgetCat[]
  currentMonthExpenses?: Record<string, number>
  connectedBankNames?: string[]
}

const PIE_COLORS = ["#8b5cf6","#3b82f6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#f97316","#84cc16","#14b8a6"]

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
  budgetCategories = [],
  currentMonthExpenses = {},
  connectedBankNames = [],
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

  // Expanded transaction titles
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set())
  function toggleTitle(id: string) {
    setExpandedTitles((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Single-delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Confirm dismiss subscription
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null)

  // Dismissed subscription IDs — persisted in localStorage
  const [dismissedSubs, setDismissedSubs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("dismissedSubscriptions")
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Custom renewal dates — persisted in localStorage
  const [subRenewalDates, setSubRenewalDates] = useState<Map<string, string>>(() => {
    try {
      const stored = localStorage.getItem("subRenewalDates")
      return stored ? new Map(JSON.parse(stored)) : new Map()
    } catch {
      return new Map()
    }
  })
  const [editingRenewalId, setEditingRenewalId] = useState<string | null>(null)
  const [renewalDateInput, setRenewalDateInput] = useState("")

  function saveRenewalDate(id: string, date: string) {
    setSubRenewalDates((prev) => {
      const next = new Map(prev)
      next.set(id, date)
      try { localStorage.setItem("subRenewalDates", JSON.stringify([...next])) } catch {}
      return next
    })
    setEditingRenewalId(null)
  }

  function dismissSubscription(id: string) {
    setDismissedSubs((prev) => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem("dismissedSubscriptions", JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // Edit transaction
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditing, startEditing] = useTransition()

  // Date-range, category, account filters, and search
  const [dateRange, setDateRange] = useState<DateRange>("this_month")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [chartPage, setChartPage] = useState(0) // 0 = most recent window

  function changeRange(r: DateRange) {
    setDateRange(r)
    setChartPage(0)
  }


  const allAccounts = useMemo(() => {
    const accounts = new Set([
      ...connectedBankNames,
      ...(optimisticTransactions.map((tx) => tx.account_name).filter(Boolean) as string[]),
    ])
    return Array.from(accounts).sort()
  }, [optimisticTransactions, connectedBankNames])

  // Transactions scoped to the selected account (before date/category filters)
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return optimisticTransactions
    return optimisticTransactions.filter((tx) => tx.account_name === selectedAccount)
  }, [optimisticTransactions, selectedAccount])

  const allCategories = useMemo(() => {
    const cats = new Set(accountTransactions.map((tx) => tx.category))
    return Array.from(cats).sort()
  }, [accountTransactions])

  const { filteredIncome, filteredExpenses, filteredNet } = useMemo(() => {
    const { start, end } = getDateBounds(dateRange)
    const filtered = accountTransactions.filter((tx) => {
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
    return { filteredIncome: income, filteredExpenses: expenses, filteredNet: income - expenses }
  }, [accountTransactions, dateRange, selectedCategory])

  // Computes anchor balance + post-anchor net for a given set of transactions.
  function anchorBalance(txs: Transaction[]): number | null {
    const withBal = txs.filter((tx) => tx.balance != null)
    if (!withBal.length) return null
    const anchor = withBal[0]
    const adj = txs
      .filter((tx) => tx.date > anchor.date || (tx.date === anchor.date && tx.balance == null))
      .reduce((sum, tx) => sum + (tx.type === "income" ? Number(tx.amount) : -Number(tx.amount)), 0)
    return (anchor.balance as number) + adj
  }

  const currentBalance = useMemo(() => {
    if (selectedAccount) {
      // Single account view — straightforward anchor
      return anchorBalance(accountTransactions)
    }
    // All Accounts — sum each named account's balance independently
    const named = [...new Set(
      optimisticTransactions.map((tx) => tx.account_name).filter(Boolean) as string[]
    )]
    if (!named.length) return anchorBalance(optimisticTransactions)
    let total = 0
    let hasAny = false
    for (const acct of named) {
      const acctTxs = optimisticTransactions.filter((tx) => tx.account_name === acct)
      const bal = anchorBalance(acctTxs)
      if (bal != null) { total += bal; hasAny = true }
    }
    // Add net of untagged (manually-added) transactions
    const untaggedNet = optimisticTransactions
      .filter((tx) => tx.account_name == null)
      .reduce((sum, tx) => sum + (tx.type === "income" ? Number(tx.amount) : -Number(tx.amount)), 0)
    return hasAny ? total + untaggedNet : null
  }, [optimisticTransactions, accountTransactions, selectedAccount])

  // When viewing All Time with a real anchor balance, the difference between
  // currentBalance and filteredNet is money already in the account before the
  // first recorded transaction. Fold it into income so the cards add up.
  const impliedStartingBalance = useMemo(() => {
    const isAllTime = dateRange === "all_time" && !selectedCategory && currentBalance != null
    if (!isAllTime) return 0
    return Math.max(0, currentBalance - filteredNet)
  }, [dateRange, selectedCategory, currentBalance, filteredNet])

  // Chart data — buckets match the selected date range
  const { chartData, chartHasOlder, chartHasNewer } = useMemo(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const PAGE = 12

    const bucket = (txs: Transaction[], label: string) => ({
      label,
      income: txs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
      expenses: txs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
    })

    if (dateRange === "this_month") {
      const year = now.getFullYear()
      const month = now.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      return {
        chartData: Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
          return bucket(accountTransactions.filter((tx) => tx.date === dateStr), String(day))
        }),
        chartHasOlder: false,
        chartHasNewer: false,
      }
    }

    if (dateRange === "all_time") {
      if (!accountTransactions.length) return { chartData: [], chartHasOlder: false, chartHasNewer: false }
      const sorted = [...accountTransactions].sort((a, b) => a.date.localeCompare(b.date))
      const earliest = new Date(sorted[0].date + "T12:00:00")
      const allMonths: { label: string; income: number; expenses: number }[] = []
      let cur = startOfMonth(earliest)
      while (cur <= now) {
        const s = format(cur, "yyyy-MM-dd")
        const e = format(endOfMonth(cur), "yyyy-MM-dd")
        allMonths.push(bucket(accountTransactions.filter((tx) => tx.date >= s && tx.date <= e), format(cur, "MMM yy")))
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
      const endIdx = Math.max(0, allMonths.length - chartPage * PAGE)
      const startIdx = Math.max(0, endIdx - PAGE)
      return {
        chartData: allMonths.slice(startIdx, endIdx),
        chartHasOlder: startIdx > 0,
        chartHasNewer: chartPage > 0,
      }
    }

    // last_3_months, last_6_months, last_year
    const count = dateRange === "last_3_months" ? 3 : dateRange === "last_6_months" ? 6 : 12
    return {
      chartData: Array.from({ length: count }, (_, i) => {
        const month = subMonths(now, count - 1 - i)
        const start = format(startOfMonth(month), "yyyy-MM-dd")
        const end = format(endOfMonth(month), "yyyy-MM-dd")
        return bucket(accountTransactions.filter((tx) => tx.date >= start && tx.date <= end), format(month, count <= 6 ? "MMM" : "MMM yy"))
      }),
      chartHasOlder: false,
      chartHasNewer: false,
    }
  }, [accountTransactions, dateRange, chartPage])

  const chartTitle = {
    this_month: "This Month — Daily",
    last_3_months: "Last 3 Months",
    last_6_months: "Last 6 Months",
    last_year: "Last 12 Months",
    all_time: "All Time",
  }[dateRange]

  // Auto-detect subscriptions: same title+amount in 2+ months, or "subscription" keyword.
  const detectedSubscriptions = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of accountTransactions) {
      if (tx.type !== "expense") continue
      const key = `${tx.title.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    }
    const result: Array<{
      id: string
      name: string
      amount: number
      category: string
      nextBillingDate: string
      latestTx: Transaction
      occurrences: number
    }> = []
    for (const [, txs] of groups) {
      const hasKeyword = /subscription|subscribe|member/i.test(txs[0].title)
      const months = new Set(txs.map((tx) => tx.date.slice(0, 7)))
      if (months.size < 2 && !hasKeyword) continue
      const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date))
      const latest = sorted[0]
      const lastDate = new Date(latest.date + "T12:00:00")
      const next = new Date(lastDate)
      next.setMonth(next.getMonth() + 1)
      result.push({
        id: `${txs[0].title}|${txs[0].amount}`,
        name: txs[0].title,
        amount: Number(txs[0].amount),
        category: txs[0].category,
        nextBillingDate: next.toISOString().split("T")[0],
        latestTx: latest,
        occurrences: txs.length,
      })
    }
    return result.sort((a, b) => b.amount - a.amount)
  }, [accountTransactions])

  const visibleSubscriptions = detectedSubscriptions.filter((s) => !dismissedSubs.has(s.id))

  // Keep the just-saved transaction at the top regardless of sort order or limit windows.
  // Uses the real DB row (not the optimistic placeholder) so the UUID always matches
  // after router.refresh() brings in the authoritative initialTransactions.
  const displayTransactions = useMemo(() => {
    let list = accountTransactions
    if (savedTx) {
      const stillExists = accountTransactions.some((tx) => tx.id === savedTx.id)
      if (stillExists) {
        const rest = accountTransactions.filter((tx) => tx.id !== savedTx.id)
        list = [savedTx, ...rest]
      }
    }
    if (selectedCategory) list = list.filter((tx) => tx.category === selectedCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((tx) => tx.title.toLowerCase().includes(q))
    }
    return list
  }, [accountTransactions, savedTx, selectedCategory, searchQuery])

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
    const count = await getTransactionCount(selectedAccount)
    setRealCount(count)
  }

  function handleClearAll() {
    startClearing(async () => {
      let result: { error?: string }
      if (selectedAccount) {
        const ids = accountTransactions.map((tx) => tx.id)
        updateOptimistic({ type: "deleteMany", ids })
        result = await deleteAccountTransactions(selectedAccount)
      } else {
        result = await deleteAllTransactions()
      }
      setConfirmClearOpen(false)
      setRealCount(null)
      if (result.error) { toast.error(result.error); return }
      toast.success(selectedAccount ? `All ${selectedAccount} transactions deleted` : "All transactions deleted")
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
    const rawAccount = fd.get("account_name") as string | null
    const chosenAccount = rawAccount && rawAccount !== "__none" ? rawAccount : (selectedAccount ?? null)
    fd.set("account_name", chosenAccount ?? "")
    const tempTx: Transaction = {
      id,
      title: fd.get("title") as string,
      amount: parseFloat(fd.get("amount") as string),
      type: fd.get("type") as string,
      category: (fd.get("category") as string) || "other",
      date: (fd.get("date") as string) || new Date().toISOString().split("T")[0],
      notes: (fd.get("notes") as string) || null,
      balance: null,
      account_name: chosenAccount,
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
          balance: (tx as { balance?: number | null }).balance ?? null,
          account_name: (tx as { account_name?: string | null }).account_name ?? null,
        }
        setSavedTx(saved)
        changeRange("all_time")
        toast.success(`"${tempTx.title}" saved`)
        router.refresh()
      }
    })
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingTx) return
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    const updatedTx: Transaction = {
      ...editingTx,
      title: fd.get("title") as string,
      amount: parseFloat(fd.get("amount") as string),
      type: fd.get("type") as string,
      category: (fd.get("category") as string) || "other",
      date: (fd.get("date") as string) || editingTx.date,
      notes: (fd.get("notes") as string) || null,
    }
    setEditingTx(null)
    startEditing(async () => {
      updateOptimistic({ type: "delete", id: editingTx.id })
      updateOptimistic({ type: "add", tx: updatedTx })
      const result = await updateTransaction(editingTx.id, fd)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${updatedTx.title}" updated`)
        router.refresh()
      }
    })
  }

  function handleExportCSV() {
    const rows = [
      ["Date", "Title", "Type", "Category", "Amount", "Balance", "Account", "Notes"],
      ...displayTransactions.map((tx) => [
        tx.date,
        `"${tx.title.replace(/"/g, '""')}"`,
        tx.type,
        tx.category,
        tx.amount.toFixed(2),
        tx.balance != null ? tx.balance.toFixed(2) : "",
        tx.account_name ?? "",
        tx.notes ? `"${tx.notes.replace(/"/g, '""')}"` : "",
      ]),
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transactions-${dateRange}${selectedAccount ? `-${selectedAccount}` : ""}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Account + date range selectors */}
      <div className="flex flex-wrap items-center gap-3">
      {allAccounts.length > 0 && (
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
          <button
            onClick={() => setSelectedAccount(null)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              !selectedAccount
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Accounts
          </button>
          {allAccounts.map((acc) => (
            <button
              key={acc}
              onClick={() => setSelectedAccount(acc)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                selectedAccount === acc
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {acc}
            </button>
          ))}
        </div>
      )}
      {/* Date range selector */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {DATE_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => changeRange(r.value)}
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Income</p>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{currency(filteredIncome + impliedStartingBalance)}</p>
        </Card>

        <Card className="p-5 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Expenses</p>
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-800 dark:text-rose-300">{currency(filteredExpenses)}</p>
        </Card>

        {(() => {
          const showingAnchor = dateRange === "all_time" && !selectedCategory && currentBalance != null
          const display = showingAnchor ? currentBalance! : filteredNet
          const pos = display >= 0
          return (
            <Card className={`p-5 ${pos ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm font-medium ${pos ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {showingAnchor ? "Current Balance" : "Net Balance"}
                </p>
                <DollarSign className={`w-4 h-4 ${pos ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`} />
              </div>
              <p className={`text-2xl font-bold ${pos ? "text-blue-800 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>
                {currency(display)}
              </p>
            </Card>
          )
        })()}
      </div>

      {/* Spending chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">{chartTitle}</p>
          {dateRange === "all_time" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setChartPage((p) => p + 1)}
                disabled={!chartHasOlder}
                className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Older months"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
              <button
                onClick={() => setChartPage((p) => p - 1)}
                disabled={!chartHasNewer}
                className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Newer months"
              >
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={chartData}
            barGap={4}
            barCategoryGap={dateRange === "this_month" ? "10%" : "30%"}
            margin={{ bottom: chartData.length > 12 ? 24 : 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              angle={chartData.length > 12 ? -35 : 0}
              textAnchor={chartData.length > 12 ? "end" : "middle"}
              interval={dateRange === "this_month" ? 4 : 0}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              width={42}
            />
            <Tooltip
              formatter={(value: number, name: string) => [currency(value), name === "income" ? "Income" : "Expenses"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1.5px solid #000",
                background: "#fff",
                color: "#000",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
              labelStyle={{ fontWeight: 700, color: "#000", marginBottom: 4 }}
              itemStyle={{ color: "#000" }}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Legend formatter={(v) => v === "income" ? "Income" : "Expenses"} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Spending by category + budget alerts */}
      {(() => {
        // Compute spending by category for current month from all transactions
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const monthEndStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`

        const catTotals: Record<string, number> = {}
        for (const tx of optimisticTransactions) {
          if (tx.type !== "expense") continue
          if (tx.date < monthStart || tx.date > monthEndStr) continue
          const cat = tx.category
          catTotals[cat] = (catTotals[cat] ?? 0) + Number(tx.amount)
        }

        const pieData = Object.entries(catTotals)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, value]) => ({ name, value }))

        const totalSpent = pieData.reduce((s, d) => s + d.value, 0)

        // Budget alerts
        const alerts: Array<{ name: string; spent: number; budget: number; pct: number }> = []
        for (const cat of budgetCategories) {
          const budget = cat.type === "percentage" ? (cat.value / 100) * monthlyIncome : cat.value
          if (budget <= 0) continue
          const spent = currentMonthExpenses[cat.name.toLowerCase()] ?? 0
          const pct = spent / budget
          if (pct >= 0.8) alerts.push({ name: cat.name, spent, budget, pct })
        }
        alerts.sort((a, b) => b.pct - a.pct)

        if (pieData.length === 0 && alerts.length === 0) return null

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart */}
            {pieData.length > 0 && (
              <Card className="p-5">
                <p className="text-sm font-semibold text-foreground mb-4">This Month — Spending by Category</p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [currency(v), ""]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1.5px solid #000", background: "#fff", color: "#000" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="flex-1 truncate capitalize text-foreground">{d.name}</span>
                        <span className="text-muted-foreground shrink-0">{totalSpent > 0 ? ((d.value / totalSpent) * 100).toFixed(0) : 0}%</span>
                        <span className="font-medium shrink-0">{currency(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Budget alerts */}
            {alerts.length > 0 && (
              <Card className="p-5">
                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Spending Alerts
                </p>
                <div className="space-y-3">
                  {alerts.map((a) => {
                    const over = a.pct > 1
                    return (
                      <div key={a.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium capitalize">{a.name}</span>
                          <span className={over ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-amber-600 dark:text-amber-400"}>
                            {currency(a.spent)} / {currency(a.budget)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-amber-400"}`}
                            style={{ width: `${Math.min(a.pct * 100, 100)}%` }}
                          />
                        </div>
                        <p className={`text-[11px] mt-0.5 ${over ? "text-rose-500" : "text-amber-500"}`}>
                          {over ? `${currency(a.spent - a.budget)} over budget` : `${(a.pct * 100).toFixed(0)}% used — ${currency(a.budget - a.spent)} remaining`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        )
      })()}

      {/* Connected Banks */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold mb-4">Connected Banks</h2>
        <PlaidConnect onSync={() => router.refresh()} />
      </Card>

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
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search…"
                      className="h-8 pl-8 pr-3 text-xs w-36 bg-transparent"
                    />
                  </div>

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

                  {/* Export */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-transparent"
                    onClick={handleExportCSV}
                    disabled={displayTransactions.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </Button>

                  <CsvImporter existingAccounts={allAccounts} />

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
                        {allAccounts.length > 0 && (
                          <div className="space-y-1.5">
                            <Label htmlFor="tx-account">Account <span className="text-muted-foreground">(optional)</span></Label>
                            <Select name="account_name" defaultValue={selectedAccount ?? "__none"}>
                              <SelectTrigger id="tx-account"><SelectValue placeholder="No account" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">No account</SelectItem>
                                {allAccounts.map((acct) => (
                                  <SelectItem key={acct} value={acct}>{acct}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
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
                          {selectedAccount ? `Delete all ${selectedAccount} transactions?` : "Delete all transactions?"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-2">
                        <p className="text-sm text-muted-foreground">
                          This will permanently delete{" "}
                          <span className="font-semibold text-foreground">
                            all {realCount ?? "…"} transaction
                            {(realCount ?? 2) !== 1 ? "s" : ""}
                          </span>{" "}
                          {selectedAccount ? `from ${selectedAccount}` : "for your account"}. This cannot be undone.
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

          {/* Single delete confirmation dialog */}
          <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Delete transaction?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground">This will permanently delete the transaction. This cannot be undone.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      if (confirmDeleteId) handleDelete(confirmDeleteId)
                      setConfirmDeleteId(null)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit transaction dialog */}
          <Dialog open={!!editingTx} onOpenChange={(o) => { if (!o) setEditingTx(null) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Transaction</DialogTitle>
              </DialogHeader>
              {editingTx && (
                <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input id="edit-title" name="title" defaultValue={editingTx.title} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-amount">Amount ($)</Label>
                      <Input id="edit-amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={editingTx.amount} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-type">Type</Label>
                      <Select name="type" defaultValue={editingTx.type}>
                        <SelectTrigger id="edit-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-category">Category</Label>
                      <Input id="edit-category" name="category" defaultValue={editingTx.category} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-date">Date</Label>
                      <Input id="edit-date" name="date" type="date" defaultValue={editingTx.date} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="edit-notes" name="notes" defaultValue={editingTx.notes ?? ""} placeholder="Additional notes…" />
                  </div>
                  {editError && <p className="text-sm text-destructive">{editError}</p>}
                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setEditingTx(null)}>Cancel</Button>
                    <Button type="submit" className="flex-1" disabled={isEditing}>
                      {isEditing ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
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
                        <div className="flex items-start gap-1 min-w-0">
                          <p className={`font-medium text-foreground text-sm ${expandedTitles.has(tx.id) ? "break-words" : "truncate"}`}>
                            {tx.title}
                          </p>
                          {tx.title.length > 35 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleTitle(tx.id) }}
                              className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTitles.has(tx.id) ? "rotate-180" : ""}`} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{tx.category}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {formatDate(tx.date)}
                          </span>
                          {tx.account_name && (
                            <>
                              <span>·</span>
                              <span className="text-primary/70">{tx.account_name}</span>
                            </>
                          )}
                        </div>
                        {tx.notes && (
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5 italic">{tx.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className={`font-semibold text-sm ${tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {tx.type === "income" ? "+" : "-"}{currency(Number(tx.amount))}
                          </span>
                          {tx.balance != null && selectedAccount && (
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              {currency(tx.balance)}
                            </p>
                          )}
                        </div>
                        {!selectMode && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditError(null); setEditingTx(tx) }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteId(tx.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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
          {/* Edit renewal date dialog */}
          <Dialog open={!!editingRenewalId} onOpenChange={(o) => { if (!o) setEditingRenewalId(null) }}>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Edit renewal date</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="renewal-date">Next billing date</Label>
                  <Input
                    id="renewal-date"
                    type="date"
                    value={renewalDateInput}
                    onChange={(e) => setRenewalDateInput(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setEditingRenewalId(null)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    disabled={!renewalDateInput}
                    onClick={() => { if (editingRenewalId) saveRenewalDate(editingRenewalId, renewalDateInput) }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Dismiss subscription confirmation */}
          <Dialog open={!!confirmDismissId} onOpenChange={(o) => { if (!o) setConfirmDismissId(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Remove subscription?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground">This will hide it from the subscriptions panel. Your transactions won't be affected.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDismissId(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      if (confirmDismissId) dismissSubscription(confirmDismissId)
                      setConfirmDismissId(null)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {visibleSubscriptions.length === 0 ? (
            <Card className="p-6 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recurring charges detected</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {visibleSubscriptions.map((sub) => (
                <Card key={sub.id} className="p-4 hover:shadow-md transition-all duration-200 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm truncate" title={sub.name}>{sub.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{sub.occurrences}× charged</span>
                        <span>·</span>
                        <span>
                          Next {subRenewalDates.has(sub.id) ? "" : "~"}{formatDate(subRenewalDates.get(sub.id) ?? sub.nextBillingDate)}
                        </span>
                        <button
                          className="text-primary underline underline-offset-2 hover:opacity-70 transition-opacity"
                          onClick={() => { setEditingRenewalId(sub.id); setRenewalDateInput(subRenewalDates.get(sub.id) ?? sub.nextBillingDate) }}
                        >
                          edit
                        </button>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize mt-1.5">
                        {sub.category}
                      </Badge>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="font-semibold text-foreground text-sm">{currency(sub.amount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditError(null); setEditingTx(sub.latestTx) }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDismissId(sub.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
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
