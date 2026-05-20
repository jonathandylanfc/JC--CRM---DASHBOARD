"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Landmark, CreditCard } from "lucide-react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { upsertNetWorthEntry, deleteNetWorthEntry } from "@/app/net-worth/actions"

interface Entry {
  id: string
  name: string
  type: "asset" | "liability"
  amount: number
  category: string | null
  updated_at: string
}

interface HistoryPoint {
  net_worth: number
  recorded_at: string
}

interface Props {
  initialEntries: Entry[]
  initialHistory: HistoryPoint[]
}

const ASSET_CATEGORIES = ["Cash & Savings", "Investments", "Real Estate", "Vehicle", "Retirement", "Other Asset"]
const LIABILITY_CATEGORIES = ["Credit Card", "Student Loan", "Mortgage", "Car Loan", "Personal Loan", "Other Debt"]

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function NetWorthContent({ initialEntries, initialHistory }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formType, setFormType] = useState<"asset" | "liability">("asset")
  const [formName, setFormName] = useState("")
  const [formAmount, setFormAmount] = useState("")
  const [formCategory, setFormCategory] = useState("")

  const assets = entries.filter((e) => e.type === "asset")
  const liabilities = entries.filter((e) => e.type === "liability")
  const totalAssets = assets.reduce((s, e) => s + Number(e.amount), 0)
  const totalLiabilities = liabilities.reduce((s, e) => s + Number(e.amount), 0)
  const netWorth = totalAssets - totalLiabilities

  // Chart: sparkline from history
  const history = initialHistory
  const maxAbs = Math.max(...history.map((h) => Math.abs(h.net_worth)), 1)
  const chartH = 80

  function openAdd(type: "asset" | "liability") {
    setEditing(null)
    setFormType(type)
    setFormName("")
    setFormAmount("")
    setFormCategory("")
    setDialogOpen(true)
  }

  function openEdit(e: Entry) {
    setEditing(e)
    setFormType(e.type)
    setFormName(e.name)
    setFormAmount(String(e.amount))
    setFormCategory(e.category ?? "")
    setDialogOpen(true)
  }

  function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData()
    fd.set("name", formName)
    fd.set("type", formType)
    fd.set("amount", formAmount)
    fd.set("category", formCategory)
    startTransition(async () => {
      const result = await upsertNetWorthEntry(editing?.id ?? null, fd)
      if (result.error) { toast.error(result.error); return }
      toast.success(editing ? "Entry updated" : "Entry added")
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    setDeleteId(null)
    startTransition(async () => {
      const result = await deleteNetWorthEntry(id)
      if (result.error) { toast.error(result.error); return }
      setEntries((prev) => prev.filter((e) => e.id !== id))
      router.refresh()
    })
  }

  const categories = formType === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Net worth summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">Total Assets</p>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{currency(totalAssets)}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{assets.length} item{assets.length !== 1 ? "s" : ""}</p>
        </Card>
        <Card className="p-5 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-400 mb-1">Total Liabilities</p>
          <p className="text-2xl font-bold text-rose-800 dark:text-rose-300">{currency(totalLiabilities)}</p>
          <p className="text-xs text-rose-600 dark:text-rose-500 mt-1">{liabilities.length} item{liabilities.length !== 1 ? "s" : ""}</p>
        </Card>
        <Card className={`p-5 ${netWorth >= 0 ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"}`}>
          <p className={`text-sm font-medium mb-1 ${netWorth >= 0 ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>Net Worth</p>
          <p className={`text-2xl font-bold ${netWorth >= 0 ? "text-blue-800 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>
            {netWorth >= 0 ? "" : "-"}{currency(Math.abs(netWorth))}
          </p>
          <p className={`text-xs mt-1 flex items-center gap-1 ${netWorth >= 0 ? "text-blue-600 dark:text-blue-500" : "text-amber-600 dark:text-amber-500"}`}>
            {netWorth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            assets minus liabilities
          </p>
        </Card>
      </div>

      {/* History sparkline */}
      {history.length > 1 && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-foreground mb-3">Net Worth Over Time</p>
          <div className="relative" style={{ height: chartH }}>
            <svg width="100%" height={chartH} className="overflow-visible">
              {(() => {
                const pts = history.map((h, i) => ({
                  x: (i / (history.length - 1)) * 100,
                  y: chartH / 2 - (h.net_worth / maxAbs) * (chartH / 2 - 8),
                  val: h.net_worth,
                  label: format(parseISO(h.recorded_at), "MMM d"),
                }))
                const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${p.y}`).join(" ")
                const last = pts[pts.length - 1]
                return (
                  <>
                    <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {pts.map((p, i) => (
                      <circle key={i} cx={`${p.x}%`} cy={p.y} r="3" fill="hsl(var(--primary))" />
                    ))}
                    <text x={`${last.x}%`} y={last.y - 8} textAnchor="end" fontSize="11" fill="hsl(var(--primary))" fontWeight="600">
                      {last.val >= 0 ? "" : "-"}{currency(Math.abs(last.val))}
                    </text>
                  </>
                )
              })()}
            </svg>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{format(parseISO(history[0].recorded_at), "MMM d")}</span>
              <span>{format(parseISO(history[history.length - 1].recorded_at), "MMM d")}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Assets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-600" /> Assets
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => openAdd("asset")}>
            <Plus className="w-3.5 h-3.5" /> Add Asset
          </Button>
        </div>
        {assets.length === 0 ? (
          <Card className="p-4 border-dashed text-center">
            <p className="text-sm text-muted-foreground">No assets yet — add your savings, investments, property…</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {assets.map((e) => (
              <Card key={e.id} className="px-4 py-3 flex items-center justify-between group hover:shadow-sm transition-all">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{e.name}</p>
                  {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{currency(Number(e.amount))}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Liabilities */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-rose-600" /> Liabilities
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => openAdd("liability")}>
            <Plus className="w-3.5 h-3.5" /> Add Liability
          </Button>
        </div>
        {liabilities.length === 0 ? (
          <Card className="p-4 border-dashed text-center">
            <p className="text-sm text-muted-foreground">No liabilities — add loans, credit card balances…</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {liabilities.map((e) => (
              <Card key={e.id} className="px-4 py-3 flex items-center justify-between group hover:shadow-sm transition-all">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{e.name}</p>
                  {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">-{currency(Number(e.amount))}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entry" : `Add ${formType === "asset" ? "Asset" : "Liability"}`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {!editing && (
              <div className="flex gap-2">
                {(["asset", "liability"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setFormType(t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all capitalize ${formType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder={formType === "asset" ? "e.g. Emergency Fund" : "e.g. Car Loan"} value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category <span className="text-muted-foreground">(optional)</span></Label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="">— Select category —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving…" : editing ? "Save" : "Add"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && handleDelete(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
