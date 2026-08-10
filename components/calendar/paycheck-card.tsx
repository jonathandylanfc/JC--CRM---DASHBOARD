"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DollarSign, Settings, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { format, parseISO } from "date-fns"
import { formatPayPeriodRange } from "@/lib/pay-period"
import { updatePaySettings } from "@/app/calendar/actions"
import { toast } from "sonner"

interface Shift {
  id: string
  title: string
  start_at: string
  end_at: string | null
  all_day: boolean
}

interface PaySettings {
  hourly_rate: number | null
  pay_period: string
  shift_keyword: string
  tax_rate: number
  pay_period_start_date: string | null
}

interface PaycheckCardProps {
  initialPaySettings: PaySettings | null
}

function hoursFromShift(shift: Shift): number {
  if (shift.all_day || !shift.end_at) return 0
  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
}

export function PaycheckCard({ initialPaySettings }: PaycheckCardProps) {
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Live data fetched client-side
  const [paySettings, setPaySettings] = useState<PaySettings | null>(initialPaySettings)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [fetching, setFetching] = useState(true)

  // Settings form state — seeded from initial props
  const [hourlyRate, setHourlyRate] = useState(initialPaySettings?.hourly_rate?.toString() ?? "")
  const [payPeriod, setPayPeriod] = useState(initialPaySettings?.pay_period ?? "biweekly")
  const [shiftKeyword, setShiftKeyword] = useState(initialPaySettings?.shift_keyword ?? "Work")
  const [taxRate, setTaxRate] = useState(initialPaySettings?.tax_rate?.toString() ?? "25")
  const [periodStartDate, setPeriodStartDate] = useState(initialPaySettings?.pay_period_start_date ?? "")

  const fetchShifts = useCallback(async () => {
    setFetching(true)
    try {
      const res = await fetch("/api/calendar/paycheck-shifts")
      if (!res.ok) return
      const data = await res.json()
      setPaySettings(data.paySettings)
      setShifts(data.shifts ?? [])
      setPeriodStart(data.periodStart ?? "")
      setPeriodEnd(data.periodEnd ?? "")
    } finally {
      setFetching(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchShifts()
  }, [fetchShifts])

  // Re-fetch whenever CalendarContent mutates local events
  useEffect(() => {
    const handler = () => fetchShifts()
    window.addEventListener("localShiftsChanged", handler)
    return () => window.removeEventListener("localShiftsChanged", handler)
  }, [fetchShifts])

  const isConfigured = paySettings?.hourly_rate != null && paySettings.hourly_rate > 0

  const totalHours = shifts.reduce((sum, s) => sum + hoursFromShift(s), 0)
  const grossPay = totalHours * (paySettings?.hourly_rate ?? 0)
  const netPay = grossPay * (1 - (paySettings?.tax_rate ?? 25) / 100)

  const periodLabel = periodStart && periodEnd
    ? formatPayPeriodRange(new Date(periodStart), new Date(periodEnd))
    : ""

  function handleSaveSettings() {
    const fd = new FormData()
    fd.set("hourly_rate", hourlyRate)
    fd.set("pay_period", payPeriod)
    fd.set("shift_keyword", shiftKeyword)
    fd.set("tax_rate", taxRate)
    fd.set("pay_period_start_date", periodStartDate)

    startTransition(async () => {
      const result = await updatePaySettings(fd)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Pay settings saved")
        setSettingsOpen(false)
        await fetchShifts()
        router.refresh()
      }
    })
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 transition-colors"
            >
              <DollarSign className="h-4 w-4 text-green-500" />
              Paycheck Estimator
              {collapsed ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="px-4 pb-4 pt-0">
            {fetching && !isConfigured ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : !isConfigured ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Set your hourly rate to estimate pay from calendar shifts.
                </p>
                <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                  Configure
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">
                    Pay period: <span className="font-medium text-foreground">{periodLabel}</span>
                    {" · "}
                    &ldquo;{paySettings!.shift_keyword}&rdquo; shifts
                  </p>
                  {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                {shifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1">
                    No &ldquo;{paySettings!.shift_keyword}&rdquo; shifts this pay period.
                  </p>
                ) : (
                  <div className="space-y-1 mb-3">
                    {shifts.map((shift) => {
                      const hrs = hoursFromShift(shift)
                      return (
                        <div key={shift.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {format(parseISO(shift.start_at), "EEE, MMM d")}
                            {" "}
                            <span className="text-foreground">{shift.title}</span>
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
                            <Clock className="h-3 w-3" />
                            {hrs > 0 ? `${hrs.toFixed(1)} hrs` : "—"}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="border-t pt-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Hours</span>
                    <span className="font-medium tabular-nums">{totalHours.toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Gross</span>
                    <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">
                      ${grossPay.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Est. Net <span className="text-xs">(~{paySettings!.tax_rate}% tax)</span>
                    </span>
                    <span className="font-medium tabular-nums">${netPay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-0.5">
                    <span>${paySettings!.hourly_rate!.toFixed(2)}/hr</span>
                    <span className="capitalize">{paySettings!.pay_period}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paycheck Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 15.00"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax_rate">Est. Tax Rate (%)</Label>
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="25"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay_period">Pay Period</Label>
              <Select value={payPeriod} onValueChange={setPayPeriod}>
                <SelectTrigger id="pay_period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly (every 2 weeks)</SelectItem>
                  <SelectItem value="semimonthly">Semimonthly (1st–15th, 16th–end)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shift_keyword">Shift Event Keyword</Label>
              <Input
                id="shift_keyword"
                placeholder="Work"
                value={shiftKeyword}
                onChange={(e) => setShiftKeyword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Calendar events whose title contains this word count as shifts.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay_period_start_date">
                Pay Period Reference Start Date
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </Label>
              <Input
                id="pay_period_start_date"
                type="date"
                value={periodStartDate}
                onChange={(e) => setPeriodStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A known pay period start date so periods stay aligned correctly.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                onClick={handleSaveSettings}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
