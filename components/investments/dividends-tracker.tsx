"use client"

import { useState, useTransition } from "react"
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
import { Plus, Trash2, DollarSign } from "lucide-react"
import { toast } from "sonner"
import { addDividend, deleteDividend } from "@/app/investments/dividends-actions"

interface Dividend {
  id: string
  symbol: string
  amount_per_share: number
  frequency: string
  ex_dividend_date: string | null
  pay_date: string | null
  shares_held: number | null
}

interface Investment {
  symbol: string
  shares: number
}

interface Props {
  initialDividends: Dividend[]
  investments: Investment[]
}

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "semi-annual": "Semi-Annual",
  annual: "Annual",
  special: "Special",
}

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  "semi-annual": 2,
  annual: 1,
  special: 1,
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function DividendsTracker({ initialDividends, investments }: Props) {
  const [dividends, setDividends] = useState<Dividend[]>(initialDividends)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Build shares map from investments
  const sharesMap = Object.fromEntries(investments.map((i) => [i.symbol.toUpperCase(), i.shares]))

  function getShares(div: Dividend): number {
    return div.shares_held ?? sharesMap[div.symbol.toUpperCase()] ?? 0
  }

  function annualIncome(div: Dividend): number {
    return getShares(div) * div.amount_per_share * (FREQUENCY_MULTIPLIER[div.frequency] ?? 1)
  }

  const totalAnnualIncome = dividends.reduce((s, d) => s + annualIncome(d), 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await addDividend(fd)
      if (result.error) { toast.error(result.error); return }
      toast.success("Dividend added")
      setOpen(false)
      // Optimistic: refetch via page refresh would be cleaner, but for UX we'll just close
      window.location.reload()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDividend(id)
      if (result.error) { toast.error(result.error); return }
      setDividends((prev) => prev.filter((d) => d.id !== id))
      toast.success("Dividend removed")
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Dividends</p>
          {dividends.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Est. annual income: <span className="font-medium text-foreground">{currency(totalAnnualIncome)}</span>
            </p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 bg-transparent">
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Dividend</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="div-symbol">Ticker</Label>
                  <Input id="div-symbol" name="symbol" placeholder="AAPL" className="uppercase" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="div-freq">Frequency</Label>
                  <Select name="frequency" defaultValue="quarterly">
                    <SelectTrigger id="div-freq"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="div-amount">Amount / Share ($)</Label>
                  <Input id="div-amount" name="amount_per_share" type="number" step="0.0001" min="0.0001" placeholder="0.00" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="div-shares">Shares <span className="text-muted-foreground">(optional override)</span></Label>
                  <Input id="div-shares" name="shares_held" type="number" step="0.0001" min="0" placeholder="auto from holdings" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="div-exdate">Ex-Dividend Date</Label>
                  <Input id="div-exdate" name="ex_dividend_date" type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="div-paydate">Pay Date</Label>
                  <Input id="div-paydate" name="pay_date" type="date" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving…" : "Add Dividend"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {dividends.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No dividends tracked yet.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add dividend-paying stocks to estimate your passive income.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dividends.map((div) => {
            const shares = getShares(div)
            const perPayment = shares * div.amount_per_share
            const annual = annualIncome(div)
            return (
              <div key={div.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border group">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{div.symbol}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{FREQUENCY_LABEL[div.frequency]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currency(div.amount_per_share)}/sh · {shares > 0 ? `${shares} shares` : "no shares found"}
                    {div.ex_dividend_date && <> · ex-div {formatDate(div.ex_dividend_date)}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{currency(annual)}/yr</p>
                  {perPayment > 0 && (
                    <p className="text-xs text-muted-foreground">{currency(perPayment)} / payment</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => handleDelete(div.id)}
                  disabled={isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )
          })}

          {/* Annual summary row */}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-border text-sm">
            <span className="text-muted-foreground">Total estimated annual income</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{currency(totalAnnualIncome)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Monthly average</span>
            <span className="font-medium text-foreground">{currency(totalAnnualIncome / 12)}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
