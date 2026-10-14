"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  Pencil,
  AlertTriangle,
  BarChart2,
  ShoppingCart,
} from "lucide-react"
import { toast } from "sonner"
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts"
import { upsertInvestment, deleteInvestment, deleteAllInvestments, bulkUpsertInvestments, refreshPrices, upsertAutoContribution, deleteAutoContribution, buyMoreShares } from "@/app/investments/actions"
import { upsertRetirementContribution, deleteRetirementContribution } from "@/app/investments/retirement-actions"
import type { RetirementContrib } from "@/app/investments/retirement-actions"
import { PlaidInvestmentsConnect } from "./plaid-investments-connect"
import { ConnectedBrokerages } from "./connected-brokerages"
import { MarketPulse } from "./market-pulse"
import { MarketNews } from "./market-news"
import { AnalystRatings } from "./analyst-ratings"
import { AiMarketInsights } from "./ai-market-insights"
import { MorningBriefingButton } from "./morning-briefing-button"
import { DayTradesTracker } from "./day-trades-tracker"
import { EconomicCalendar } from "./economic-calendar"
import type { DayTrade } from "@/app/investments/day-trades-actions"


interface Investment {
  id: string
  symbol: string
  name: string | null
  shares: number
  avg_cost: number
  current_price: number | null
  sector: string | null
  asset_type: string
  updated_at: string
}

interface AutoContrib {
  id: string
  symbol: string
  amount: number
  calendar_keyword: string
  last_applied_event_date: string | null
}

const SECTORS = ["Technology", "Healthcare", "Finance", "Energy", "Consumer", "Industrials", "Real Estate", "Utilities", "Materials", "Communication", "Other"]
const ASSET_TYPES = ["stock", "etf", "crypto", "mutual fund", "option"]

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

// Custom tooltip for portfolio chart showing value + daily change
function PortfolioTooltip({
  active, payload, label, history,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  history: Array<{ value: number }>
}) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  const idx = history.findIndex((h) => h.value === value)
  const prev = idx > 0 ? history[idx - 1].value : null
  const change = prev != null ? value - prev : null
  const changePct = prev != null && prev > 0 ? ((value - prev) / prev) * 100 : null
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">{currency(value)}</p>
      {change != null && (
        <p className={`font-medium mt-0.5 ${change >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
          {change >= 0 ? "+" : ""}{currency(change)} ({changePct != null ? pct(changePct) : ""}){" "}
          <span className="text-[10px] text-muted-foreground">day</span>
        </p>
      )}
    </div>
  )
}

// Parse Webull CSV exports (positions or transaction history)
function parseWebullCsv(text: string): Array<{ symbol: string; name?: string; shares: number; avg_cost: number; current_price?: number }> {
  const lines = text.trim().split("\n").filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase())

  // Detect format
  const hasQty = headers.some((h) => h.includes("qty") || h.includes("quantity") || h.includes("shares"))
  const hasAvgCost = headers.some((h) => h.includes("avg") || h.includes("cost") || h.includes("average"))
  const hasSide = headers.some((h) => h === "side" || h === "action" || h === "type")

  if (!hasQty) throw new Error("Could not find a Qty/Shares column. Make sure you're exporting Positions from Webull.")

  // Map column names
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.includes(n))
      if (idx !== -1) return idx
    }
    return -1
  }

  const symIdx = col(["symbol", "ticker"])
  const nameIdx = col(["name", "description", "security"])
  const qtyIdx = col(["qty", "quantity", "shares"])
  const avgIdx = col(["avg cost", "avg. cost", "average cost", "cost basis", "price"])
  const priceIdx = col(["current price", "last price", "market price", "close"])
  const sideIdx = col(["side", "action", "type"])

  if (symIdx === -1) throw new Error("No Symbol column found")
  if (qtyIdx === -1) throw new Error("No Quantity/Shares column found")

  const results = new Map<string, { symbol: string; name?: string; shares: number; avg_cost: number; current_price?: number }>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/"/g, "").trim())
    const symbol = cols[symIdx]?.toUpperCase()
    if (!symbol || symbol === "SYMBOL" || symbol === "") continue

    const rawQty = parseFloat(cols[qtyIdx]?.replace(/[^0-9.-]/g, "") ?? "0")
    const rawPrice = avgIdx !== -1 ? parseFloat(cols[avgIdx]?.replace(/[^0-9.-]/g, "") ?? "0") : 0
    const rawCurrent = priceIdx !== -1 ? parseFloat(cols[priceIdx]?.replace(/[^0-9.-]/g, "") ?? "0") : undefined
    const name = nameIdx !== -1 ? cols[nameIdx] : undefined
    const side = sideIdx !== -1 ? cols[sideIdx]?.toLowerCase() : undefined

    if (isNaN(rawQty) || rawQty === 0) continue

    if (hasSide) {
      // Transaction history — aggregate buys/sells
      const existing = results.get(symbol)
      const qty = side === "sell" ? -rawQty : rawQty
      if (existing) {
        const totalCost = existing.avg_cost * existing.shares + rawPrice * qty
        const newShares = existing.shares + qty
        results.set(symbol, {
          ...existing,
          shares: newShares,
          avg_cost: newShares > 0 ? totalCost / newShares : 0,
        })
      } else {
        results.set(symbol, { symbol, name, shares: qty, avg_cost: rawPrice, current_price: rawCurrent })
      }
    } else {
      // Positions snapshot — one row per holding
      results.set(symbol, {
        symbol,
        name,
        shares: rawQty,
        avg_cost: rawPrice,
        current_price: rawCurrent && rawCurrent > 0 ? rawCurrent : undefined,
      })
    }
  }

  return Array.from(results.values()).filter((r) => r.shares > 0)
}

interface BudgetCat {
  id: string
  name: string
  type: "percentage" | "fixed" | "fixed_plus_percentage"
  value: number
  base_amount: number | null
  transfer_keywords: string | null
}

const PAY_FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly (2×/mo)",
  monthly: "Monthly",
}

const PAY_FREQ_MULTIPLIER: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
}

interface Props {
  initialInvestments: Investment[]
  prevCloseMap?: Record<string, number>
  initialDayTrades?: DayTrade[]
  initialAutoContribs?: AutoContrib[]
  budgetCategories?: BudgetCat[]
  budgetMonthlyIncome?: number
  initialRetirementContribs?: RetirementContrib[]
}

const INVEST_KEYWORDS = ["401k", "ira", "roth", "stock", "invest", "brokerage", "espp", "hsa", "retirement", "fidelity", "vanguard", "schwab", "webull", "acorns", "etf"]

function isInvestmentCategory(name: string): boolean {
  const n = name.toLowerCase()
  return INVEST_KEYWORDS.some((kw) => n.includes(kw))
}

function parseInvestMeta(keywords: string | null) {
  const parts = (keywords ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  let matchPct: number | null = null
  let currentBalance: number | null = null
  for (const p of parts) {
    if (p.startsWith("~em:")) { const v = parseFloat(p.slice(4)); if (!isNaN(v)) matchPct = v }
    else if (p.startsWith("~cb:")) { const v = parseFloat(p.slice(4)); if (!isNaN(v)) currentBalance = v }
  }
  return { matchPct, currentBalance }
}

function budgetedAmount(cat: BudgetCat, income: number): number {
  if (cat.type === "percentage") return (cat.value / 100) * income
  if (cat.type === "fixed_plus_percentage") return (cat.base_amount ?? 0) + (cat.value / 100) * income
  return cat.value
}

function projectBalance(current: number, monthly: number, years: number, rate = 0.07): number {
  const r = rate / 12
  const n = years * 12
  if (r === 0) return current + monthly * n
  return current * Math.pow(1 + r, n) + monthly * (Math.pow(1 + r, n) - 1) / r
}

export function InvestmentsContent({ initialInvestments, prevCloseMap = {}, initialDayTrades = [], initialAutoContribs = [], budgetCategories = [], budgetMonthlyIncome = 0, initialRetirementContribs = [] }: Props) {
  const router = useRouter()

  // Take full control of scroll restoration — browser auto-restore misfires on this page
  useEffect(() => {
    const KEY = "scroll-investments"
    window.history.scrollRestoration = "manual"
    const saved = sessionStorage.getItem(KEY)
    if (saved !== null) {
      const y = +saved
      sessionStorage.removeItem(KEY)
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
    }
    const save = () => sessionStorage.setItem(KEY, String(window.scrollY))
    window.addEventListener("beforeunload", save)
    return () => {
      window.removeEventListener("beforeunload", save)
      window.history.scrollRestoration = "auto"
    }
  }, [])

  const refreshKeepScroll = useCallback(() => {
    const y = window.scrollY
    router.refresh()
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
  }, [router])
  const [investments, setInvestments] = useState<Investment[]>(initialInvestments)
  useEffect(() => { setInvestments(initialInvestments) }, [initialInvestments])
  const [open, setOpen] = useState(false)
  const [editingInv, setEditingInv] = useState<Investment | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [isDeletingAll, startDeletingAll] = useTransition()
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseWebullCsv> | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, startRefreshing] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const [totalBalMode, setTotalBalMode] = useState(false)
  const [buyMoreTarget, setBuyMoreTarget] = useState<Investment | null>(null)
  const [buyMoreShares_, setBuyMoreShares] = useState("")
  const [buyMorePrice, setBuyMorePrice] = useState("")
  const [isBuyingMore, startBuyingMore] = useTransition()
  const [autoContribs, setAutoContribs] = useState<AutoContrib[]>(initialAutoContribs)
  const [contribAmount, setContribAmount] = useState("100")
  const [contribKeyword, setContribKeyword] = useState("paycheck")
  const [isSavingContrib, startSavingContrib] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // Retirement / payroll-deducted accounts
  const [retirementContribs, setRetirementContribs] = useState<RetirementContrib[]>(initialRetirementContribs)
  useEffect(() => { setRetirementContribs(initialRetirementContribs) }, [initialRetirementContribs])
  const [retirementOpen, setRetirementOpen] = useState(false)
  const [editingRetirement, setEditingRetirement] = useState<RetirementContrib | null>(null)
  const [confirmDeleteRetirement, setConfirmDeleteRetirement] = useState<string | null>(null)
  const [isSavingRetirement, startSavingRetirement] = useTransition()
  const [isDeletingRetirement, startDeletingRetirement] = useTransition()
  const [retirementContribMode, setRetirementContribMode] = useState<"dollar" | "percent">("dollar")
  const [retirementForm, setRetirementForm] = useState({
    name: "",
    contribution_per_paycheck: "",
    contribution_pct: "",
    pay_frequency: "biweekly",
    employer_match_pct: "",
    current_balance: "",
    tax_bracket_pct: "",
  })

  function grossPerPaycheck(freq: string) {
    if (!budgetMonthlyIncome) return null
    const mult = PAY_FREQ_MULTIPLIER[freq] ?? (26 / 12)
    return budgetMonthlyIncome / mult
  }

  function openAddRetirement() {
    setEditingRetirement(null)
    setRetirementContribMode("dollar")
    setRetirementForm({ name: "", contribution_per_paycheck: "", contribution_pct: "", pay_frequency: "biweekly", employer_match_pct: "", current_balance: "", tax_bracket_pct: "" })
    setRetirementOpen(true)
  }

  function openEditRetirement(rc: RetirementContrib) {
    setEditingRetirement(rc)
    const isPct = rc.contribution_pct != null && rc.contribution_pct > 0
    setRetirementContribMode(isPct ? "percent" : "dollar")
    setRetirementForm({
      name: rc.name,
      contribution_per_paycheck: rc.contribution_per_paycheck > 0 && !isPct ? String(rc.contribution_per_paycheck) : "",
      contribution_pct: isPct ? String(rc.contribution_pct) : "",
      pay_frequency: rc.pay_frequency,
      employer_match_pct: rc.employer_match_pct > 0 ? String(rc.employer_match_pct) : "",
      current_balance: rc.current_balance > 0 ? String(rc.current_balance) : "",
      tax_bracket_pct: rc.tax_bracket_pct > 0 ? String(rc.tax_bracket_pct) : "",
    })
    setRetirementOpen(true)
  }

  function handleRetirementSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startSavingRetirement(async () => {
      const fd = new FormData()
      if (editingRetirement) fd.set("id", editingRetirement.id)
      fd.set("name", retirementForm.name)
      fd.set("pay_frequency", retirementForm.pay_frequency)
      fd.set("employer_match_pct", retirementForm.employer_match_pct || "0")
      fd.set("current_balance", retirementForm.current_balance || "0")
      fd.set("tax_bracket_pct", retirementForm.tax_bracket_pct || "0")
      if (retirementContribMode === "percent") {
        const pct = parseFloat(retirementForm.contribution_pct) || 0
        const gross = grossPerPaycheck(retirementForm.pay_frequency) ?? 0
        fd.set("contribution_pct", String(pct))
        fd.set("contribution_per_paycheck", String((gross * pct) / 100))
      } else {
        fd.set("contribution_pct", "")
        fd.set("contribution_per_paycheck", retirementForm.contribution_per_paycheck || "0")
      }
      const result = await upsertRetirementContribution(fd)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${retirementForm.name} saved`)
      setRetirementOpen(false)
      setEditingRetirement(null)
      refreshKeepScroll()
    })
  }

  function handleRetirementDelete(id: string) {
    startDeletingRetirement(async () => {
      const result = await deleteRetirementContribution(id)
      if (result.error) { toast.error(result.error); return }
      setRetirementContribs((prev) => prev.filter((r) => r.id !== id))
      setConfirmDeleteRetirement(null)
    })
  }

  // Portfolio history for line chart
  const [history, setHistory] = useState<Array<{ date: string; label: string; value: number }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRange, setHistoryRange] = useState<"1d" | "1w" | "30d" | "6m" | "1y" | "all">("1w")
  const [historyNoKey, setHistoryNoKey] = useState(false)
  const [historyRateLimited, setHistoryRateLimited] = useState(false)
  const [activeTab, setActiveTab] = useState<"trading" | "investments">("trading")

  const fetchHistory = useCallback(async () => {
    if (investments.length === 0) return
    setHistoryLoading(true)
    setHistoryNoKey(false)
    setHistoryRateLimited(false)
    try {
      const r = await fetch(`/api/investments/historical?range=${historyRange}`)
      const d = await r.json()
      if (d.noKey) setHistoryNoKey(true)
      if (d.rateLimited) setHistoryRateLimited(true)
      setHistory(d.history ?? [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [investments, historyRange])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // Pre-fill auto-contribution fields when editing a mutual fund
  useEffect(() => {
    if (editingInv?.asset_type === "mutual fund") {
      const existing = autoContribs.find((c) => c.symbol === editingInv.symbol)
      setContribAmount(existing?.amount?.toString() ?? "100")
      setContribKeyword(existing?.calendar_keyword ?? "paycheck")
    }
  }, [editingInv])

  // Auto-refresh prices + chart every 5 min during market hours (M-F 9:30–16:00 ET)
  useEffect(() => {
    function isMarketOpen() {
      const now = new Date()
      const day = now.getDay()
      if (day === 0 || day === 6) return false
      const etTime = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false })
      const [h, m] = etTime.split(":").map(Number)
      const mins = h * 60 + m
      return mins >= 9 * 60 + 30 && mins < 16 * 60
    }
    if (!isMarketOpen()) return
    const interval = setInterval(async () => {
      await refreshPrices()
      refreshKeepScroll()
      fetchHistory()
    }, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(interval)
  }, [fetchHistory])

  // Summary stats — market holdings
  const totalCost = investments.reduce((s, inv) => s + inv.shares * inv.avg_cost, 0)
  const holdingsValue = investments.reduce((s, inv) => s + inv.shares * (inv.current_price ?? inv.avg_cost), 0)
  const totalGain = holdingsValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  // Retirement / payroll-deducted balances
  const retirementTotal = retirementContribs.reduce((s, r) => s + r.current_balance, 0)

  // Budget investment category balances (encoded as ~cb: in transfer_keywords)
  const budgetInvestTotal = budgetCategories
    .filter((c) => isInvestmentCategory(c.name))
    .reduce((s, c) => { const { currentBalance } = parseInvestMeta(c.transfer_keywords); return s + (currentBalance ?? 0) }, 0)

  const totalValue = holdingsValue + retirementTotal + budgetInvestTotal

  // Total monthly contributions across all sources
  const totalMonthlyContrib = (() => {
    const fromRetirement = retirementContribs.reduce((s, r) => {
      const mult = PAY_FREQ_MULTIPLIER[r.pay_frequency] ?? (26 / 12)
      const mo = r.contribution_pct != null && r.contribution_pct > 0 && budgetMonthlyIncome > 0
        ? budgetMonthlyIncome * (r.contribution_pct / 100)
        : r.contribution_per_paycheck * mult
      return s + mo + mo * (r.employer_match_pct / 100)
    }, 0)
    const fromBudget = budgetMonthlyIncome > 0
      ? budgetCategories.filter((c) => isInvestmentCategory(c.name)).reduce((s, c) => {
          const { matchPct } = parseInvestMeta(c.transfer_keywords)
          const m = budgetedAmount(c, budgetMonthlyIncome)
          return s + m + (matchPct != null ? m * (matchPct / 100) : 0)
        }, 0)
      : 0
    return fromRetirement + fromBudget
  })()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    setCsvPreview(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parseWebullCsv(text)
        if (!parsed.length) {
          setCsvError("No valid holdings found in this CSV. Make sure you're exporting Positions from Webull.")
          return
        }
        setCsvPreview(parsed)
      } catch (err: unknown) {
        setCsvError(err instanceof Error ? err.message : "Failed to parse CSV")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function handleImport() {
    if (!csvPreview?.length) return
    startImporting(async () => {
      const result = await bulkUpsertInvestments(csvPreview)
      if (result.error) { toast.error(result.error); return }
      toast.success(`Imported ${result.count} holding${result.count !== 1 ? "s" : ""}`)
      setCsvOpen(false)
      setCsvPreview(null)
      refreshKeepScroll()
    })
  }

  function handleRefresh() {
    startRefreshing(async () => {
      const result = await refreshPrices()
      if ("error" in result) { toast.error(result.error); return }
      toast.success(`Updated prices for ${result.updated} holding${result.updated !== 1 ? "s" : ""}`)
      refreshKeepScroll()
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    // "Total Balance" mode: user entered a lump-sum balance (e.g. 401k account).
    // Override shares=1 and price=balance so the portfolio total shows the right number.
    const totalBalance = fd.get("total_balance") as string
    if (totalBalance && parseFloat(totalBalance) > 0) {
      fd.set("shares", "1")
      fd.set("avg_cost", totalBalance)
      fd.set("current_price", totalBalance)
      fd.set("asset_type", "mutual fund")
    }
    startTransition(async () => {
      const result = await upsertInvestment(fd)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${fd.get("symbol")} saved`)
      setOpen(false)
      setEditingInv(null)
      setTotalBalMode(false)
      refreshKeepScroll()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteInvestment(id)
      if (result.error) { toast.error(result.error); return }
      setInvestments((prev) => prev.filter((i) => i.id !== id))
      setConfirmDeleteId(null)
      refreshKeepScroll()
    })
  }

  const dialogForm = (inv?: Investment, showAutoContrib?: boolean) => (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="symbol">Ticker Symbol</Label>
          <Input id="symbol" name="symbol" placeholder="e.g. AAPL" defaultValue={inv?.symbol} required className="uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="asset_type">Type</Label>
          <Select name="asset_type" defaultValue={inv?.asset_type ?? "stock"}>
            <SelectTrigger id="asset_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSET_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Company Name <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="name" name="name" placeholder="e.g. Apple Inc." defaultValue={inv?.name ?? ""} />
      </div>

      {totalBalMode ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="total_balance">Account Balance ($)</Label>
            <Input id="total_balance" name="total_balance" type="number" step="0.01" min="0.01" placeholder="e.g. 1789.79" required autoFocus />
            <p className="text-[11px] text-muted-foreground">Sets value to this amount directly (ideal for 401k / retirement accounts). Price refresh is disabled for mutual funds.</p>
          </div>
          {/* hidden placeholders so server action gets valid shares/avg_cost */}
          <input type="hidden" name="shares" value="1" />
          <input type="hidden" name="avg_cost" value="0" />
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setTotalBalMode(false)}>
            Switch to shares / avg cost instead
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input id="shares" name="shares" type="number" step="0.0001" min="0.0001" placeholder="0" defaultValue={inv?.shares} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avg_cost">Avg Cost / Share ($)</Label>
              <Input id="avg_cost" name="avg_cost" type="number" step="0.01" min="0" placeholder="0.00" defaultValue={inv?.avg_cost} required />
            </div>
          </div>
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setTotalBalMode(true)}>
            Set as total account balance instead (401k / retirement)
          </button>
        </div>
      )}

      {!totalBalMode && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="current_price">Current Price ($) <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="current_price" name="current_price" type="number" step="0.01" min="0" placeholder="auto-fetch" defaultValue={inv?.current_price ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sector">Sector <span className="text-muted-foreground">(optional)</span></Label>
            <Select name="sector" defaultValue={inv?.sector ?? ""}>
              <SelectTrigger id="sector"><SelectValue placeholder="Select sector" /></SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Auto-contribution config — only shown when editing an existing mutual fund */}
      {showAutoContrib && inv && (
        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Auto-Contribution</p>
            <p className="text-xs text-muted-foreground mt-0.5">Automatically add to this balance when a matching event appears on your calendar.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount per event ($)</Label>
              <Input
                type="number" step="0.01" min="1" placeholder="100"
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Calendar keyword</Label>
              <Input
                placeholder="paycheck"
                value={contribKeyword}
                onChange={(e) => setContribKeyword(e.target.value)}
              />
            </div>
          </div>
          {autoContribs.find((c) => c.symbol === inv.symbol)?.last_applied_event_date && (
            <p className="text-[11px] text-muted-foreground">
              Last applied: {autoContribs.find((c) => c.symbol === inv.symbol)!.last_applied_event_date}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 bg-transparent text-xs"
              disabled={isSavingContrib}
              onClick={() => {
                startSavingContrib(async () => {
                  const fd = new FormData()
                  fd.set("symbol", inv.symbol)
                  fd.set("amount", contribAmount)
                  fd.set("keyword", contribKeyword)
                  const result = await upsertAutoContribution(fd)
                  if (result.error) { toast.error(result.error); return }
                  setAutoContribs((prev) => {
                    const idx = prev.findIndex((c) => c.symbol === inv.symbol)
                    const updated: AutoContrib = {
                      id: idx >= 0 ? prev[idx].id : "",
                      symbol: inv.symbol,
                      amount: parseFloat(contribAmount),
                      calendar_keyword: contribKeyword,
                      last_applied_event_date: idx >= 0 ? prev[idx].last_applied_event_date : null,
                    }
                    return idx >= 0 ? prev.map((c, i) => i === idx ? updated : c) : [...prev, updated]
                  })
                  toast.success("Auto-contribution saved — $" + contribAmount + " per " + contribKeyword)
                })
              }}
            >
              {isSavingContrib ? "Saving…" : "Save rule"}
            </Button>
            {autoContribs.some((c) => c.symbol === inv.symbol) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  startSavingContrib(async () => {
                    const result = await deleteAutoContribution(inv.symbol)
                    if (result.error) { toast.error(result.error); return }
                    setAutoContribs((prev) => prev.filter((c) => c.symbol !== inv.symbol))
                    toast.success("Auto-contribution removed")
                  })
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => { setOpen(false); setEditingInv(null); setTotalBalMode(false) }}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  )

  const holdingSymbols = investments.map((inv) => inv.symbol)
  const sharesMap = Object.fromEntries(investments.map((inv) => [inv.symbol, inv.shares]))
  const avgCostMap = Object.fromEntries(investments.map((inv) => [inv.symbol, inv.avg_cost]))

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-0 border-b border-border">
        <button
          onClick={() => setActiveTab("trading")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === "trading" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Day Trading
        </button>
        <button
          onClick={() => setActiveTab("investments")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === "investments" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Long Term Investments
        </button>
      </div>

      {/* ── Trading tab ────────────────────────────────────── */}
      {activeTab === "trading" && (
        <div className="space-y-6">
          <MarketPulse holdingSymbols={holdingSymbols} />
          <EconomicCalendar />
          <Card className="p-4 md:p-6">
            <DayTradesTracker initialTrades={initialDayTrades} />
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <MarketNews holdingSymbols={holdingSymbols} />
            </div>
            <div>
              <AnalystRatings holdingSymbols={holdingSymbols} sharesMap={sharesMap} avgCostMap={avgCostMap} />
            </div>
          </div>
        </div>
      )}

      {/* ── Investments tab ────────────────────────────────── */}
      {activeTab === "investments" && (
        <div className="space-y-6">

      {/* Funded from Budget */}
      {(() => {
        const investCats = budgetCategories.filter((c) => isInvestmentCategory(c.name))
        if (investCats.length === 0 || budgetMonthlyIncome === 0) return null
        const totalMonthly = investCats.reduce((sum, c) => {
          const { matchPct } = parseInvestMeta(c.transfer_keywords)
          const m = budgetedAmount(c, budgetMonthlyIncome)
          return sum + m + (matchPct != null ? m * (matchPct / 100) : 0)
        }, 0)
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Funded from Budget
              </h2>
              <span className="text-xs text-muted-foreground">{currency(totalMonthly)}/mo total</span>
            </div>
            <Card className="p-4">
              <div className="space-y-4">
                {investCats.map((cat) => {
                  const { matchPct, currentBalance } = parseInvestMeta(cat.transfer_keywords)
                  const monthly = budgetedAmount(cat, budgetMonthlyIncome)
                  const matchMonthly = matchPct != null ? monthly * (matchPct / 100) : 0
                  const totalMo = monthly + matchMonthly
                  const cb = currentBalance ?? 0
                  const proj5 = projectBalance(cb, totalMo, 5)
                  const proj10 = projectBalance(cb, totalMo, 10)
                  const proj30 = projectBalance(cb, totalMo, 30)
                  return (
                    <div key={cat.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm">{cat.name}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {cat.type === "percentage" ? `${cat.value}% of income` : `${currency(cat.value)}/mo`}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Your monthly</p>
                          <p className="font-semibold tabular-nums">{currency(monthly)}</p>
                          <p className="text-muted-foreground">{currency(monthly * 12)}/yr</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">
                            {matchPct != null && matchPct > 0 ? `Employer match (${matchPct}%)` : "Employer match"}
                          </p>
                          <p className={`font-semibold tabular-nums ${matchPct != null && matchPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                            {matchPct != null && matchPct > 0 ? `+${currency(matchMonthly)}` : "—"}
                          </p>
                          {matchPct != null && matchPct > 0 && <p className="text-muted-foreground">+{currency(matchMonthly * 12)}/yr</p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Total monthly</p>
                          <p className="font-semibold tabular-nums">{currency(totalMo)}</p>
                          <p className="text-muted-foreground">{currency(totalMo * 12)}/yr</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Current balance</p>
                          <p className="font-semibold tabular-nums">
                            {currentBalance != null ? currency(currentBalance) : <span className="text-muted-foreground/60 text-[10px]">set in Budget</span>}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-muted-foreground mb-0.5">5yr est.</p>
                          <p className="font-semibold tabular-nums">{currency(proj5)}</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-muted-foreground mb-0.5">10yr est.</p>
                          <p className="font-semibold tabular-nums">{currency(proj10)}</p>
                        </div>
                        <div className="rounded-md bg-primary/10 border border-primary/20 p-2">
                          <p className="text-muted-foreground mb-0.5">30yr est.</p>
                          <p className="font-semibold tabular-nums text-primary">{currency(proj30)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
                Projections assume 7% avg annual return, compounded monthly. Edit balance and employer match in the Budget page.
              </p>
            </Card>
          </div>
        )
      })()}

      {/* Payroll-Deducted Accounts (401k, etc.) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Payroll-Deducted Accounts
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5 bg-transparent text-xs h-7" onClick={openAddRetirement}>
            <Plus className="w-3.5 h-3.5" />
            Add Account
          </Button>
        </div>
        {retirementContribs.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-foreground mb-1">No payroll-deducted accounts yet</p>
            <p className="text-xs text-muted-foreground mb-3">Add your 401k, HSA, or any account funded by payroll deductions to track contributions and projections.</p>
            <Button size="sm" className="gap-2" onClick={openAddRetirement}><Plus className="w-4 h-4" />Add Account</Button>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="space-y-4">
              {retirementContribs.map((rc) => {
                const mult = PAY_FREQ_MULTIPLIER[rc.pay_frequency] ?? (26 / 12)
                // If saved as %, derive from current income so it stays in sync with income updates
                const monthly = rc.contribution_pct != null && rc.contribution_pct > 0 && budgetMonthlyIncome > 0
                  ? budgetMonthlyIncome * (rc.contribution_pct / 100)
                  : rc.contribution_per_paycheck * mult
                const livePerPaycheck = rc.contribution_pct != null && rc.contribution_pct > 0 && budgetMonthlyIncome > 0
                  ? monthly / mult
                  : rc.contribution_per_paycheck
                const matchMonthly = monthly * (rc.employer_match_pct / 100)
                const totalMo = monthly + matchMonthly
                const proj5 = projectBalance(rc.current_balance, totalMo, 5)
                const proj10 = projectBalance(rc.current_balance, totalMo, 10)
                const proj30 = projectBalance(rc.current_balance, totalMo, 30)
                return (
                  <div key={rc.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm">{rc.name}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {rc.contribution_pct != null && rc.contribution_pct > 0
                            ? `${rc.contribution_pct}% of paycheck`
                            : `${currency(rc.contribution_per_paycheck)}/${PAY_FREQ_LABELS[rc.pay_frequency]?.split(" ")[0].toLowerCase() ?? rc.pay_frequency}`}
                        </Badge>
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground" onClick={() => openEditRetirement(rc)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteRetirement(rc.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Per paycheck</p>
                        <p className="font-semibold tabular-nums">{currency(livePerPaycheck)}</p>
                        {rc.contribution_pct != null && rc.contribution_pct > 0 ? (
                          <p className="text-muted-foreground">{rc.contribution_pct}% of paycheck</p>
                        ) : rc.tax_bracket_pct > 0 ? (
                          <p className="text-emerald-600 dark:text-emerald-400">
                            costs you {currency(livePerPaycheck * (1 - rc.tax_bracket_pct / 100))}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">{PAY_FREQ_LABELS[rc.pay_frequency]}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Monthly (est.)</p>
                        <p className="font-semibold tabular-nums">{currency(monthly)}</p>
                        {rc.tax_bracket_pct > 0 ? (
                          <p className="text-emerald-600 dark:text-emerald-400">saves {currency(monthly * 12 * (rc.tax_bracket_pct / 100))}/yr tax</p>
                        ) : (
                          <p className="text-muted-foreground">{currency(monthly * 12)}/yr</p>
                        )}
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">
                          {rc.employer_match_pct > 0 ? `Employer match (${rc.employer_match_pct}%)` : "Employer match"}
                        </p>
                        <p className={`font-semibold tabular-nums ${rc.employer_match_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                          {rc.employer_match_pct > 0 ? `+${currency(matchMonthly)}/mo` : "—"}
                        </p>
                        {rc.employer_match_pct > 0 && <p className="text-muted-foreground">+{currency(matchMonthly * 12)}/yr</p>}
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Current balance</p>
                        <p className="font-semibold tabular-nums">
                          {rc.current_balance > 0 ? currency(rc.current_balance) : <span className="text-muted-foreground/60">—</span>}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-muted-foreground mb-0.5">5yr est.</p>
                        <p className="font-semibold tabular-nums">{currency(proj5)}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-muted-foreground mb-0.5">10yr est.</p>
                        <p className="font-semibold tabular-nums">{currency(proj10)}</p>
                      </div>
                      <div className="rounded-md bg-primary/10 border border-primary/20 p-2">
                        <p className="text-muted-foreground mb-0.5">30yr est.</p>
                        <p className="font-semibold tabular-nums text-primary">{currency(proj30)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
              Projections assume 7% avg annual return, compounded monthly.
            </p>
          </Card>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Portfolio</p>
          <p className="text-xl font-bold">{currency(totalValue)}</p>
          {(retirementTotal > 0 || budgetInvestTotal > 0) && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {currency(holdingsValue)} holdings
              {retirementTotal > 0 && ` · ${currency(retirementTotal)} retirement`}
              {budgetInvestTotal > 0 && ` · ${currency(budgetInvestTotal)} savings`}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Holdings Value</p>
          <p className="text-xl font-bold">{currency(holdingsValue)}</p>
        </Card>
        <Card className={`p-4 ${totalGain >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800"}`}>
          <p className={`text-xs mb-1 ${totalGain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>Holdings Gain/Loss</p>
          <p className={`text-xl font-bold ${totalGain >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
            {totalGain >= 0 ? "+" : ""}{currency(totalGain)}
          </p>
          <p className={`text-xs font-medium flex items-center gap-0.5 mt-0.5 ${totalGainPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {totalGainPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {pct(totalGainPct)}
          </p>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Monthly Contributions</p>
          <p className="text-xl font-bold text-primary">{currency(totalMonthlyContrib)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{currency(totalMonthlyContrib * 12)}/yr across all accounts</p>
        </Card>
      </div>

      {/* Charts */}
      {investments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart A: Cost vs Current Value */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-4">Cost vs. Current Value</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={investments.map((inv) => ({
                  name: inv.symbol,
                  Cost: parseFloat((inv.shares * inv.avg_cost).toFixed(2)),
                  Value: parseFloat((inv.shares * (inv.current_price ?? inv.avg_cost)).toFixed(2)),
                }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={44} />
                <Tooltip
                  formatter={(value: number, name: string) => [currency(value), name]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    background: "#1c1c1e",
                    border: "1px solid #2d2d2f",
                    color: "#f5f5f7",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  }}
                  labelStyle={{ color: "#8e8e93", marginBottom: 4 }}
                  itemStyle={{ color: "#f5f5f7" }}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                />
                <Bar dataKey="Cost" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Cost Basis" />
                <Bar dataKey="Value" radius={[3, 3, 0, 0]} name="Current Value">
                  {investments.map((inv, i) => {
                    const gain = inv.shares * (inv.current_price ?? inv.avg_cost) - inv.shares * inv.avg_cost
                    return <Cell key={i} fill={gain >= 0 ? "#22c55e" : "#f43f5e"} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Chart D: Portfolio Value Over Time */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Portfolio Value</p>
              <div className="flex items-center gap-1">
                {historyLoading && <span className="text-xs text-muted-foreground animate-pulse mr-2">Loading…</span>}
                {(["1d", "1w", "30d", "6m", "1y", "all"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setHistoryRange(r)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      historyRange === r
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "all" ? "All" : r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Period performance summary */}
            {!historyLoading && history.length >= 2 && (() => {
              const start = history[0].value
              const end = history[history.length - 1].value
              const change = end - start
              const changePct = (change / start) * 100
              const isUp = change >= 0
              const rangeLabel: Record<string, string> = {
                "1d": "Today", "1w": "Past week", "30d": "Past 30 days",
                "6m": "Past 6 months", "1y": "Past year", "all": "All time",
              }
              return (
                <div className="flex items-baseline gap-2 mb-3">
                  <span className={`text-lg font-bold ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
                    {isUp ? "+" : ""}{currency(change)}
                  </span>
                  <span className={`text-sm font-semibold ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
                    ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
                  </span>
                  <span className="text-xs text-muted-foreground">{rangeLabel[historyRange]}</span>
                </div>
              )
            })()}

            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={history} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={historyRange === "1d" ? 11 : Math.floor(history.length / 5)}
                  angle={historyRange === "1d" ? 0 : -25}
                  textAnchor={historyRange === "1d" ? "middle" : "end"}
                  height={historyRange === "1d" ? 20 : 40}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => {
                    if (historyRange === "1d") {
                      // Show dollar precision for intraday so small moves are visible
                      return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    }
                    return `$${(v / 1000).toFixed(1)}k`
                  }}
                  width={60}
                  domain={([dataMin, dataMax]: [number, number]) => {
                    const pad = (dataMax - dataMin) * 0.15 || dataMin * 0.002
                    return [Math.floor(dataMin - pad), Math.ceil(dataMax + pad)]
                  }}
                />
                <Tooltip content={<PortfolioTooltip history={history} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366f1" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!historyLoading && historyNoKey && (
              <div className="text-center mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Add a free Alpha Vantage key to see historical data.</p>
                <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary underline">Get free key →</a>
                <p className="text-[10px] text-muted-foreground">Then add <code className="bg-muted px-1 rounded">ALPHA_VANTAGE_KEY</code> in Railway Variables.</p>
              </div>
            )}
            {!historyLoading && historyRateLimited && history.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                API limit reached (25/day) — chart data will refresh tomorrow. Data is now cached so this won&apos;t happen again.
              </p>
            )}
            {!historyLoading && !historyNoKey && !historyRateLimited && history.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                {historyRange === "1d" ? "No intraday data — click Refresh Prices during market hours" : "No history available"}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh prices */}
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={handleRefresh} disabled={isRefreshing || investments.length === 0}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Prices</span>
          </Button>

          {/* Morning briefing */}
          <MorningBriefingButton />

          {/* Plaid connect */}
          <PlaidInvestmentsConnect onSuccess={() => router.refresh()} hasBrokerage={true} />

          {/* CSV Import */}
          <Dialog open={csvOpen} onOpenChange={(o) => { setCsvOpen(o); if (!o) { setCsvPreview(null); setCsvError(null) } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Import from Webull CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How to export from Webull:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open Webull app → Portfolio</li>
                    <li>Tap the menu → <strong>Export</strong></li>
                    <li>Select <strong>Positions</strong> (recommended) or Transaction History</li>
                    <li>Save as CSV and upload below</li>
                  </ol>
                </div>

                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm font-medium">Click to upload CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports Webull Positions or Transaction History exports</p>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                </div>

                {csvError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{csvError}</p>
                  </div>
                )}

                {csvPreview && csvPreview.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{csvPreview.length} holding{csvPreview.length !== 1 ? "s" : ""} found:</p>
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                      {csvPreview.map((row) => {
                        const value = row.shares * row.avg_cost
                        return (
                          <div key={row.symbol} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/50">
                            <div>
                              <span className="font-semibold">{row.symbol}</span>
                              {row.name && <span className="text-muted-foreground ml-1.5">{row.name}</span>}
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground">{row.shares} shares @ {currency(row.avg_cost)}</span>
                              {row.current_price && <span className="ml-2 text-primary">now {currency(row.current_price)}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Existing holdings with the same ticker will be updated.</p>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1 bg-transparent" onClick={() => { setCsvPreview(null); setCsvError(null) }}>Clear</Button>
                      <Button className="flex-1" onClick={handleImport} disabled={isImporting}>
                        {isImporting ? "Importing…" : `Import ${csvPreview.length} Holdings`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete all */}
          {investments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear All</span>
            </Button>
          )}

          {/* Add manually */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Holding
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Holding</DialogTitle>
              </DialogHeader>
              {dialogForm()}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Connected brokerages */}
      <ConnectedBrokerages />

      {/* Holdings list */}
      {investments.length === 0 ? (
        <Card className="p-10 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No holdings yet</p>
          <p className="text-xs text-muted-foreground mb-4">Import your Webull positions via CSV or add holdings manually.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <PlaidInvestmentsConnect onSuccess={() => router.refresh()} hasBrokerage={true} />
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setCsvOpen(true)}>
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Add Holding
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {investments.map((inv) => {
            const isMutualFund = inv.asset_type === "mutual fund"
            const price = inv.current_price ?? inv.avg_cost
            const value = inv.shares * price
            const cost = inv.shares * inv.avg_cost
            const gain = value - cost
            const gainPct = cost > 0 ? (gain / cost) * 100 : 0
            const hasPrice = inv.current_price != null

            // Today's change — skip for mutual funds (balance accounts have no meaningful intraday data)
            const prevClose = !isMutualFund ? prevCloseMap[inv.symbol.toUpperCase()] : undefined
            const todayChange = hasPrice && prevClose ? inv.current_price! - prevClose : null
            const todayChangePct = todayChange != null && prevClose ? (todayChange / prevClose) * 100 : null
            const todayChangeTotal = todayChange != null ? todayChange * inv.shares : null

            return (
              <Card key={inv.id} className="p-4 group hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${gain >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"}`}>
                    {inv.symbol.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{inv.symbol}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">{inv.asset_type}</Badge>
                      {inv.sector && <Badge variant="outline" className="text-[10px] h-4 px-1.5 hidden sm:inline-flex">{inv.sector}</Badge>}
                    </div>
                    {inv.name && <p className="text-xs text-muted-foreground truncate">{inv.name}</p>}
                    <p className="text-xs text-muted-foreground">
                      {isMutualFund
                        ? <>Balance · manually managed</>
                        : <>{inv.shares} shares · avg {currency(inv.avg_cost)}{hasPrice && <> · now {currency(inv.current_price!)}</>}</>
                      }
                    </p>
                    {/* Today's intraday change */}
                    {todayChange != null && todayChangePct != null && (
                      <p className={`text-xs font-medium mt-0.5 ${todayChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {todayChange >= 0 ? "▲" : "▼"} {todayChange >= 0 ? "+" : ""}{currency(todayChange)}/sh
                        {" "}({todayChange >= 0 ? "+" : ""}{todayChangePct.toFixed(2)}%)
                        {todayChangeTotal != null && (
                          <span className="text-muted-foreground font-normal">
                            {" "}· {todayChangeTotal >= 0 ? "+" : ""}{currency(todayChangeTotal)} today
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{currency(value)}</p>
                    {isMutualFund ? (
                      <p className="text-[10px] text-muted-foreground">manual balance</p>
                    ) : (
                      <>
                        <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {gain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {gain >= 0 ? "+" : ""}{currency(gain)} ({pct(gainPct)})
                        </p>
                        {!hasPrice && <p className="text-[10px] text-muted-foreground">no price data</p>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {!isMutualFund && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-emerald-600"
                        title="Buy more shares"
                        onClick={() => { setBuyMoreTarget(inv); setBuyMoreShares(""); setBuyMorePrice("") }}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingInv(inv)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(inv.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* AI Insights — full width */}
      {investments.length > 0 && <AiMarketInsights />}

        </div>
      )}

      {/* Buy More dialog */}
      <Dialog open={!!buyMoreTarget} onOpenChange={(o) => { if (!o) setBuyMoreTarget(null) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Buy More {buyMoreTarget?.symbol}</DialogTitle>
          </DialogHeader>
          {buyMoreTarget && (() => {
            const addShares = parseFloat(buyMoreShares_) || 0
            const addPrice = parseFloat(buyMorePrice) || 0
            const newTotal = buyMoreTarget.shares + addShares
            const newAvg = addShares > 0 && addPrice > 0
              ? (buyMoreTarget.shares * buyMoreTarget.avg_cost + addShares * addPrice) / newTotal
              : buyMoreTarget.avg_cost
            return (
              <div className="space-y-3 mt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional shares</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="e.g. 7.712"
                    value={buyMoreShares_}
                    onChange={(e) => setBuyMoreShares(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Price per share ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 229.51"
                    value={buyMorePrice}
                    onChange={(e) => setBuyMorePrice(e.target.value)}
                  />
                </div>
                {addShares > 0 && addPrice > 0 && (
                  <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New total shares</span>
                      <span className="font-semibold">{newTotal.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New avg cost</span>
                      <span className="font-semibold">${newAvg.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Was</span>
                      <span className="text-muted-foreground">{buyMoreTarget.shares.toFixed(4)} sh @ ${buyMoreTarget.avg_cost.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setBuyMoreTarget(null)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    disabled={isBuyingMore || addShares <= 0 || addPrice <= 0}
                    onClick={() => {
                      startBuyingMore(async () => {
                        const res = await buyMoreShares(buyMoreTarget.id, addShares, addPrice)
                        if (res.error) { toast.error(res.error); return }
                        toast.success(`Added ${addShares} shares of ${buyMoreTarget.symbol}`)
                        setBuyMoreTarget(null)
                        refreshKeepScroll()
                      })
                    }}
                  >
                    {isBuyingMore ? "Saving…" : "Add Shares"}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingInv} onOpenChange={(o) => { if (!o) { setEditingInv(null); setTotalBalMode(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingInv?.symbol}</DialogTitle>
          </DialogHeader>
          {editingInv && dialogForm(editingInv, editingInv.asset_type === "mutual fund")}
        </DialogContent>
      </Dialog>

      {/* Delete ALL confirmation */}
      <Dialog open={confirmDeleteAll} onOpenChange={(o) => { if (!o) setConfirmDeleteAll(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Clear all holdings?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all {investments.length} holdings. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteAll(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={isDeletingAll}
                onClick={() => {
                  startDeletingAll(async () => {
                    const result = await deleteAllInvestments()
                    if (result.error) { toast.error(result.error); return }
                    toast.success("All holdings deleted")
                    setConfirmDeleteAll(false)
                    refreshKeepScroll()
                  })
                }}
              >
                {isDeletingAll ? "Deleting…" : "Delete All"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit retirement contribution */}
      <Dialog open={retirementOpen} onOpenChange={(o) => { if (!o) { setRetirementOpen(false); setEditingRetirement(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRetirement ? `Edit ${editingRetirement.name}` : "Add Payroll-Deducted Account"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRetirementSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-name">Account name</Label>
              <Input
                id="rc-name"
                placeholder="e.g. 401k, HSA, Roth IRA"
                value={retirementForm.name}
                onChange={(e) => setRetirementForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            {/* Contribution mode toggle */}
            <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setRetirementContribMode("dollar")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${retirementContribMode === "dollar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                $ per paycheck
              </button>
              <button
                type="button"
                onClick={() => setRetirementContribMode("percent")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${retirementContribMode === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                % of paycheck
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                {retirementContribMode === "dollar" ? (
                  <>
                    <Label htmlFor="rc-cpp">Per-paycheck contribution ($)</Label>
                    <Input
                      id="rc-cpp"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 200"
                      value={retirementForm.contribution_per_paycheck}
                      onChange={(e) => setRetirementForm((f) => ({ ...f, contribution_per_paycheck: e.target.value }))}
                      required
                    />
                  </>
                ) : (
                  <>
                    <Label htmlFor="rc-pct">% of gross paycheck</Label>
                    <Input
                      id="rc-pct"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="e.g. 6"
                      value={retirementForm.contribution_pct}
                      onChange={(e) => setRetirementForm((f) => ({ ...f, contribution_pct: e.target.value }))}
                      required
                    />
                    {budgetMonthlyIncome > 0 && retirementForm.contribution_pct && (
                      <p className="text-[11px] text-muted-foreground">
                        ≈ {currency(((grossPerPaycheck(retirementForm.pay_frequency) ?? 0) * (parseFloat(retirementForm.contribution_pct) || 0)) / 100)}/paycheck
                      </p>
                    )}
                    {!budgetMonthlyIncome && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Set expected income in Settings to use % mode</p>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-freq">Pay frequency</Label>
                <Select
                  value={retirementForm.pay_frequency}
                  onValueChange={(v) => setRetirementForm((f) => ({ ...f, pay_frequency: v }))}
                >
                  <SelectTrigger id="rc-freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_FREQ_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rc-match">Employer match % <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="rc-match"
                  type="number"
                  step="0.1"
                  min="0"
                  max="200"
                  placeholder="e.g. 50"
                  value={retirementForm.employer_match_pct}
                  onChange={(e) => setRetirementForm((f) => ({ ...f, employer_match_pct: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">% of your contribution matched by employer</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-bal">Current balance ($) <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="rc-bal"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 12000"
                  value={retirementForm.current_balance}
                  onChange={(e) => setRetirementForm((f) => ({ ...f, current_balance: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-tax">Your income tax bracket % <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="rc-tax"
                type="number"
                step="1"
                min="0"
                max="60"
                placeholder="e.g. 22"
                value={retirementForm.tax_bracket_pct}
                onChange={(e) => setRetirementForm((f) => ({ ...f, tax_bracket_pct: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Used to show the real after-tax cost of your 401k contribution (pre-tax accounts only)</p>
            </div>
            {(retirementForm.contribution_per_paycheck || retirementForm.contribution_pct) && (
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                {(() => {
                  const cpp = retirementContribMode === "percent"
                    ? ((grossPerPaycheck(retirementForm.pay_frequency) ?? 0) * (parseFloat(retirementForm.contribution_pct) || 0)) / 100
                    : parseFloat(retirementForm.contribution_per_paycheck) || 0
                  const mult = PAY_FREQ_MULTIPLIER[retirementForm.pay_frequency] ?? (26 / 12)
                  const monthly = cpp * mult
                  const matchPct = parseFloat(retirementForm.employer_match_pct) || 0
                  const matchMo = monthly * (matchPct / 100)
                  const taxPct = parseFloat(retirementForm.tax_bracket_pct) || 0
                  const afterTaxCpp = taxPct > 0 ? cpp * (1 - taxPct / 100) : null
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Per paycheck (pre-tax)</span>
                        <span className="font-semibold">{currency(cpp)}</span>
                      </div>
                      {afterTaxCpp != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">After-tax cost to you</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{currency(afterTaxCpp)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. monthly contribution</span>
                        <span className="font-semibold">{currency(monthly)}</span>
                      </div>
                      {matchPct > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. employer match</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{currency(matchMo)}</span>
                        </div>
                      )}
                      {taxPct > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annual tax savings</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{currency(monthly * 12 * (taxPct / 100))}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1">
                        <span className="text-muted-foreground">Total going in/month</span>
                        <span className="font-semibold">{currency(monthly + matchMo)}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => { setRetirementOpen(false); setEditingRetirement(null) }}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={isSavingRetirement}>{isSavingRetirement ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete retirement confirmation */}
      <Dialog open={!!confirmDeleteRetirement} onOpenChange={(o) => { if (!o) setConfirmDeleteRetirement(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Remove account?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">This will remove the account and its contribution data. This cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteRetirement(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" disabled={isDeletingRetirement} onClick={() => confirmDeleteRetirement && handleRetirementDelete(confirmDeleteRetirement)}>
                {isDeletingRetirement ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Remove holding?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">This will remove the holding from your portfolio. This cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)} disabled={isPending}>
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
