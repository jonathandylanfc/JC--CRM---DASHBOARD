"use client"

import { useState, useOptimistic, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2, TrendingUp, DollarSign, PiggyBank, Percent } from "lucide-react"
import { toast } from "sonner"
import { createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from "@/app/budget/actions"

interface BudgetCategory {
  id: string
  name: string
  type: "percentage" | "fixed"
  value: number
  sort_order: number
}

interface BudgetContentProps {
  initialCategories: BudgetCategory[]
  monthlyIncome: number
  expensesByCategory: Record<string, number>
}

type OptimisticAction =
  | { type: "add"; category: BudgetCategory }
  | { type: "update"; category: BudgetCategory }
  | { type: "delete"; id: string }

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function budgetedAmount(cat: BudgetCategory, income: number): number {
  return cat.type === "percentage" ? (cat.value / 100) * income : cat.value
}

const SUGGESTED = ["Investments", "Savings", "Food", "Car", "Housing", "Bills", "Transport", "Health", "Entertainment", "Other"]

export function BudgetContent({ initialCategories, monthlyIncome, expensesByCategory }: BudgetContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [categories, updateOptimistic] = useOptimistic(
    initialCategories,
    (state: BudgetCategory[], action: OptimisticAction) => {
      if (action.type === "add") return [...state, action.category]
      if (action.type === "update") return state.map((c) => c.id === action.category.id ? action.category : c)
      if (action.type === "delete") return state.filter((c) => c.id !== action.id)
      return state
    }
  )

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState<"percentage" | "fixed">("percentage")
  const [formValue, setFormValue] = useState("")

  function openAdd() {
    setEditingCategory(null)
    setFormName("")
    setFormType("percentage")
    setFormValue("")
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(cat: BudgetCategory) {
    setEditingCategory(cat)
    setFormName(cat.name)
    setFormType(cat.type)
    setFormValue(String(cat.value))
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)

    if (editingCategory) {
      const optimistic: BudgetCategory = {
        ...editingCategory,
        name: formName,
        type: formType,
        value: parseFloat(formValue),
      }
      setDialogOpen(false)
      startTransition(async () => {
        updateOptimistic({ type: "update", category: optimistic })
        const result = await updateBudgetCategory(editingCategory.id, fd)
        if (result.error) toast.error(result.error)
        else router.refresh()
      })
    } else {
      const optimistic: BudgetCategory = {
        id: `temp-${Date.now()}`,
        name: formName,
        type: formType,
        value: parseFloat(formValue),
        sort_order: categories.length,
      }
      setDialogOpen(false)
      startTransition(async () => {
        updateOptimistic({ type: "add", category: optimistic })
        const result = await createBudgetCategory(fd)
        if (result.error) toast.error(result.error)
        else router.refresh()
      })
    }
  }

  function handleDelete(id: string) {
    setDeleteId(null)
    startTransition(async () => {
      updateOptimistic({ type: "delete", id })
      const result = await deleteBudgetCategory(id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  // Summary calculations
  const { totalBudgeted, totalPercent, unallocatedDollars } = useMemo(() => {
    const totalBudgeted = categories.reduce((sum, cat) => sum + budgetedAmount(cat, monthlyIncome), 0)
    const totalPercent = monthlyIncome > 0 ? (totalBudgeted / monthlyIncome) * 100 : 0
    const unallocatedDollars = Math.max(0, monthlyIncome - totalBudgeted)
    return { totalBudgeted, totalPercent, unallocatedDollars }
  }, [categories, monthlyIncome])

  const overBudget = totalBudgeted > monthlyIncome && monthlyIncome > 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Monthly Income</p>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{currency(monthlyIncome)}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">This month</p>
        </Card>

        <Card className={`p-5 ${overBudget ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800" : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-medium ${overBudget ? "text-rose-700 dark:text-rose-400" : "text-blue-700 dark:text-blue-400"}`}>Total Budgeted</p>
            <DollarSign className={`w-4 h-4 ${overBudget ? "text-rose-600" : "text-blue-600"}`} />
          </div>
          <p className={`text-2xl font-bold ${overBudget ? "text-rose-800 dark:text-rose-300" : "text-blue-800 dark:text-blue-300"}`}>{currency(totalBudgeted)}</p>
          <p className={`text-xs mt-1 ${overBudget ? "text-rose-600 dark:text-rose-500" : "text-blue-600 dark:text-blue-500"}`}>{totalPercent.toFixed(1)}% of income{overBudget ? " — over budget!" : ""}</p>
        </Card>

        <Card className="p-5 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-violet-700 dark:text-violet-400">Unallocated</p>
            <PiggyBank className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-2xl font-bold text-violet-800 dark:text-violet-300">{currency(unallocatedDollars)}</p>
          <p className="text-xs text-violet-600 dark:text-violet-500 mt-1">{monthlyIncome > 0 ? (100 - totalPercent).toFixed(1) : "0.0"}% unplanned</p>
        </Card>

        <Card className="p-5 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Categories</p>
            <Percent className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">{categories.length}</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">budget lines</p>
        </Card>
      </div>

      {/* Category list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Budget Categories</h2>
          <Button size="sm" className="gap-2" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            Add Category
          </Button>
        </div>

        {categories.length === 0 ? (
          <Card className="p-10 text-center">
            <PiggyBank className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No budget categories yet. Add one to get started.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED.map((name) => (
                <button
                  key={name}
                  onClick={() => { setFormName(name); setFormType("percentage"); setFormValue(""); setEditingCategory(null); setFormError(null); setDialogOpen(true) }}
                  className="px-3 py-1 text-xs rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                >
                  + {name}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const budgeted = budgetedAmount(cat, monthlyIncome)
              const actual = expensesByCategory[cat.name.toLowerCase()] ?? 0
              const pct = budgeted > 0 ? Math.min((actual / budgeted) * 100, 100) : 0
              const over = actual > budgeted && budgeted > 0
              const warn = pct >= 80 && !over

              return (
                <Card key={cat.id} className="p-5 group hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{cat.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {cat.type === "percentage" ? `${cat.value}% of income` : `${currency(cat.value)}/mo`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{currency(budgeted)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                        <p className={`text-xs ${over ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"}`}>
                          {currency(actual)} spent
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(cat)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(cat.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          over ? "bg-rose-500" : warn ? "bg-amber-400" : "bg-emerald-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{pct.toFixed(0)}% used</span>
                      {over
                        ? <span className="text-rose-600 dark:text-rose-400 font-medium">{currency(actual - budgeted)} over</span>
                        : <span>{currency(budgeted - actual)} remaining</span>
                      }
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "New Budget Category"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="budget-name">Category name</Label>
              <Input
                id="budget-name"
                name="name"
                placeholder="e.g. Investments"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            {/* Type toggle */}
            <div className="space-y-1.5">
              <Label>Allocation type</Label>
              <input type="hidden" name="type" value={formType} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormType("percentage")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                    formType === "percentage"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  % of income
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("fixed")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                    formType === "fixed"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Fixed $ amount
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budget-value">
                {formType === "percentage" ? "Percentage (%)" : "Monthly amount ($)"}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {formType === "percentage" ? "%" : "$"}
                </span>
                <Input
                  id="budget-value"
                  name="value"
                  type="number"
                  step="0.01"
                  min="0"
                  max={formType === "percentage" ? "100" : undefined}
                  placeholder={formType === "percentage" ? "20" : "500"}
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  className="pl-7"
                  required
                />
              </div>
              {formType === "percentage" && monthlyIncome > 0 && formValue && (
                <p className="text-xs text-muted-foreground">
                  = {currency((parseFloat(formValue) / 100) * monthlyIncome)}/mo based on current income
                </p>
              )}
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? "Saving…" : editingCategory ? "Save Changes" : "Add Category"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this budget category?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your budget plan. Your transactions won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
