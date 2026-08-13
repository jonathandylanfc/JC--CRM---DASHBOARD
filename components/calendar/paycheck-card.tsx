"use client"

import { useState, useTransition, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
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
import { DollarSign, Settings, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { format, startOfWeek, startOfMonth, endOfMonth, differenceInDays, addDays } from "date-fns"
import { formatPayPeriodRange } from "@/lib/pay-period"
import { updatePaySettings } from "@/app/calendar/actions"
import { setExpectedMonthlyIncome } from "@/app/budget/actions"
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
  shift_exclude_keyword: string | null
  tax_rate: number
  pay_period_start_date: string | null
  pay_delay_days: number
}

interface PaycheckCardProps {
  initialPaySettings: PaySettings | null
}

function hoursFromShift(shift: Shift): number {
  if (shift.all_day || !shift.end_at) return 0
  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const raw = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
  if (raw >= 8) return raw - 1
  if (raw >= 6) return raw - 0.5
  return raw
}

function countPaychecksInMonth(
  refDateStr: string | null | undefined,
  payPeriod: string,
  monthDate: Date,
): number {
  if (payPeriod === "semimonthly") return 2
  const intervalDays = payPeriod === "weekly" ? 7 : 14
  const fallback = payPeriod === "weekly" ? 4 : 2
  if (!refDateStr) return fallback
  const ref = new Date(refDateStr)
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const daysDiff = differenceInDays(monthStart, ref)
  const periodsBack = Math.floor(daysDiff / intervalDays)
  let cur = addDays(ref, periodsBack * intervalDays)
  // step back one period if we overshot
  while (cur > monthStart) cur = addDays(cur, -intervalDays)
  let count = 0
  while (cur <= monthEnd) {
    if (cur >= monthStart) count++
    cur = addDays(cur, intervalDays)
  }
  return count
}


export function PaycheckCard({ initialPaySettings }: PaycheckCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [paySettings, setPaySettings] = useState<PaySettings | null>(initialPaySettings)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [fetching, setFetching] = useState(true)
  const [periodOffset, setPeriodOffset] = useState(0)

  const [hourlyRate, setHourlyRate] = useState(initialPaySettings?.hourly_rate?.toString() ?? "")
  const [payPeriod, setPayPeriod] = useState(initialPaySettings?.pay_period ?? "biweekly")
  const [shiftKeyword, setShiftKeyword] = useState(initialPaySettings?.shift_keyword ?? "Work")
  const [shiftExcludeKeyword, setShiftExcludeKeyword] = useState(initialPaySettings?.shift_exclude_keyword ?? "")
  const [taxRate, setTaxRate] = useState(initialPaySettings?.tax_rate?.toString() ?? "25")
  const [periodStartDate, setPeriodStartDate] = useState(initialPaySettings?.pay_period_start_date ?? "")
  const [payDelayDays, setPayDelayDays] = useState(initialPaySettings?.pay_delay_days?.toString() ?? "0")

  const fetchShifts = useCallback(async (offset: number) => {
    setFetching(true)
    try {
      const res = await fetch(`/api/calendar/paycheck-shifts?offset=${offset}`)
      if (!res.ok) return
      const data = await res.json()
      const ps: PaySettings = data.paySettings
      setPaySettings(ps)

      const pStart: string = data.periodStart ?? ""
      const pEnd: string = data.periodEnd ?? ""
      setPeriodStart(pStart)
      setPeriodEnd(pEnd)

      if (!pStart || !pEnd || !ps?.hourly_rate) {
        setShifts(data.shifts ?? [])
        return
      }

      const kw = (ps.shift_keyword ?? "work").toLowerCase()
      const excKw = (ps.shift_exclude_keyword ?? "").toLowerCase().trim()

      function matchesKeyword(title: string) {
        const t = title.toLowerCase()
        if (!t.includes(kw)) return false
        if (excKw && t.includes(excKw)) return false
        return true
      }
      function inPeriod(start: string | null | undefined) {
        if (!start) return false
        const d = start.slice(0, 10)
        return d >= pStart.slice(0, 10) && d <= pEnd.slice(0, 10)
      }

      const [gRes, caldavRes, icsRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/calendar/caldav"),
        fetch("/api/calendar/ics"),
      ])
      const gData = gRes.ok ? await gRes.json() : {}
      const caldavData = caldavRes.ok ? await caldavRes.json() : {}
      const icsData = icsRes.ok ? await icsRes.json() : {}

      type RawEvent = { id?: string | null; title: string; start: string | null; end?: string | null; allDay?: boolean }
      const external: Shift[] = [
        ...(gData.events ?? []) as RawEvent[],
        ...(caldavData.events ?? []) as RawEvent[],
        ...(icsData.events ?? []) as RawEvent[],
      ]
        .filter(e => inPeriod(e.start) && matchesKeyword(e.title))
        .map(e => ({
          id: e.id ?? `ext-${e.start}`,
          title: e.title,
          start_at: e.start!,
          end_at: e.end ?? null,
          all_day: e.allDay ?? false,
        }))

      const seen = new Set<string>()
      const merged = [...(data.shifts ?? []), ...external].filter((s: Shift) => {
        const key = `${s.title.toLowerCase()}|${s.start_at.slice(0, 10)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setShifts(merged.sort((a: Shift, b: Shift) => a.start_at.localeCompare(b.start_at)))
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => { fetchShifts(periodOffset) }, [fetchShifts, periodOffset])

  useEffect(() => {
    const handler = () => fetchShifts(periodOffset)
    window.addEventListener("localShiftsChanged", handler)
    return () => window.removeEventListener("localShiftsChanged", handler)
  }, [fetchShifts, periodOffset])

  // After first fetch of current period, switch to previous period if its pay date is sooner
  const didInitOffset = useRef(false)
  useEffect(() => {
    if (didInitOffset.current || fetching || periodOffset !== 0 || !periodStart || !paySettings?.pay_delay_days) return
    didInitOffset.current = true
    // Use noon to avoid UTC-midnight timezone shift flipping the day
    const prevEnd = new Date(periodStart.slice(0, 10) + "T12:00:00")
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevPayDate = new Date(prevEnd)
    prevPayDate.setDate(prevEnd.getDate() + paySettings.pay_delay_days)
    if (prevPayDate >= new Date()) {
      setPeriodOffset(-1)
    }
  }, [fetching, periodOffset, periodStart, paySettings])

  const isConfigured = paySettings?.hourly_rate != null && paySettings.hourly_rate > 0

  const periodMonth = periodStart ? new Date(periodStart) : new Date()
  const paychecksInMonth = countPaychecksInMonth(
    paySettings?.pay_period_start_date,
    paySettings?.pay_period ?? "biweekly",
    periodMonth,
  )
  const paychecksPerMonth = paychecksInMonth

  const totalHours = shifts.reduce((sum, s) => sum + hoursFromShift(s), 0)
  const grossPay = totalHours * (paySettings?.hourly_rate ?? 0)
  const netPay = grossPay * (1 - (paySettings?.tax_rate ?? 25) / 100)
  const monthlyNetEstimate = netPay * paychecksPerMonth

  const periodLabel = periodStart && periodEnd
    ? formatPayPeriodRange(new Date(periodStart), new Date(periodEnd))
    : ""

  const payDate = (() => {
    if (!periodEnd || !(paySettings?.pay_delay_days)) return null
    const d = new Date(periodEnd.slice(0, 10) + "T12:00:00")
    d.setDate(d.getDate() + paySettings.pay_delay_days)
    return d
  })()

  // The period before this one pays sooner — if it's still upcoming, this one is "Following"
  const isNextPaycheck = (() => {
    if (!periodStart || !paySettings?.pay_delay_days) return true
    const prevEnd = new Date(periodStart.slice(0, 10) + "T12:00:00")
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevPayDate = new Date(prevEnd)
    prevPayDate.setDate(prevPayDate.getDate() + paySettings.pay_delay_days)
    return prevPayDate < new Date()
  })()

  // Compute monthly total by summing all paychecks whose pay date falls in the same calendar month
  const [monthlyTotal, setMonthlyTotal] = useState<number | null>(null)
  useEffect(() => {
    if (fetching || !payDate || !paySettings?.hourly_rate) { setMonthlyTotal(null); return }
    const payMonthKey = format(payDate, "yyyy-MM")
    const rate = paySettings.hourly_rate
    const taxFactor = 1 - (paySettings.tax_rate ?? 25) / 100
    async function computeMonthly() {
      let total = netPay
      for (const adj of [-2, -1, 1, 2]) {
        const adjOffset = periodOffset + adj
        if (adjOffset > 0) continue
        try {
          const res = await fetch(`/api/calendar/paycheck-shifts?offset=${adjOffset}`)
          if (!res.ok) continue
          const data = await res.json()
          if (!data.periodEnd || !data.paySettings?.pay_delay_days) continue
          const adjPay = new Date(data.periodEnd.slice(0, 10) + "T12:00:00")
          adjPay.setDate(adjPay.getDate() + data.paySettings.pay_delay_days)
          if (format(adjPay, "yyyy-MM") !== payMonthKey) continue
          const adjHours = (data.shifts ?? []).reduce((s: number, sh: Shift) => s + hoursFromShift(sh), 0)
          total += adjHours * rate * taxFactor
        } catch { /* skip */ }
      }
      setMonthlyTotal(total)
    }
    computeMonthly()
  }, [fetching, payDate, periodOffset, paySettings, netPay])

  // Auto-sync monthly total to budget whenever current period is loaded
  const lastSyncedEstimate = useRef<number>(-1)
  useEffect(() => {
    if (fetching || periodOffset !== 0 || !monthlyTotal || monthlyTotal <= 0) return
    if (Math.abs(monthlyTotal - lastSyncedEstimate.current) < 0.01) return
    lastSyncedEstimate.current = monthlyTotal
    setExpectedMonthlyIncome(monthlyTotal)
  }, [fetching, periodOffset, monthlyTotal])

  const weeklyHours = (() => {
    const weekMap = new Map<string, { label: string; hours: number }>()
    for (const shift of shifts) {
      const weekStart = startOfWeek(new Date(shift.start_at), { weekStartsOn: 0 })
      const key = format(weekStart, "yyyy-MM-dd")
      const hrs = hoursFromShift(shift)
      if (!weekMap.has(key)) {
        weekMap.set(key, { label: `Week of ${format(weekStart, "MMM d")}`, hours: 0 })
      }
      weekMap.get(key)!.hours += hrs
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
  })()

  function handleSaveSettings() {
    const fd = new FormData()
    fd.set("hourly_rate", hourlyRate)
    fd.set("pay_period", payPeriod)
    fd.set("shift_keyword", shiftKeyword)
    fd.set("shift_exclude_keyword", shiftExcludeKeyword)
    fd.set("tax_rate", taxRate)
    fd.set("pay_period_start_date", periodStartDate)
    fd.set("pay_delay_days", payDelayDays)

    startTransition(async () => {
      const result = await updatePaySettings(fd)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Pay settings saved")
        setSettingsOpen(false)
        await fetchShifts(periodOffset)
        router.refresh()
      }
    })
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3 mb-4 rounded-lg border border-border hover:border-primary/40 bg-card transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium">Paycheck Estimator</span>
          {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isConfigured && !fetching && netPay > 0 && payDate && (
            <span className="tabular-nums">pay {format(payDate, "MMM d")} · ${netPay.toFixed(2)}</span>
          )}
          {isConfigured && !fetching && netPay > 0 && !payDate && (
            <span className="tabular-nums">${netPay.toFixed(2)} net</span>
          )}
          {!isConfigured && !fetching && <span className="text-xs">Not configured</span>}
          <ChevronRight className="h-4 w-4 shrink-0" />
        </div>
      </button>

      {/* Main dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                Paycheck Estimator
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => { setOpen(false); setSettingsOpen(true) }}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogHeader>

          {isConfigured && payDate && payDate >= new Date() && (
            <div className="mx-6 mt-1 mb-0 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-green-700 dark:text-green-400 font-medium">{isNextPaycheck ? "Next paycheck" : "Following paycheck"}</span>
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">{format(payDate, "EEEE, MMM d")}</span>
            </div>
          )}

          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1 mt-1">
            {!isConfigured ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Set your hourly rate to estimate pay from calendar shifts.
                </p>
                <Button size="sm" onClick={() => { setOpen(false); setSettingsOpen(true) }}>
                  Configure
                </Button>
              </div>
            ) : (
              <>
                {/* Period navigation */}
                <div className="flex items-center gap-1">
                  <button onClick={() => setPeriodOffset(o => o - 1)} className="p-1 rounded hover:bg-muted transition-colors">
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <p className="text-xs text-center flex-1">
                    <span className="font-medium">{periodLabel}</span>
                    {periodOffset < 0 && (
                      payDate && payDate >= new Date()
                        ? <span className="text-amber-500 dark:text-amber-400"> · pay due {format(payDate, "MMM d")}</span>
                        : <span className="text-muted-foreground"> · past</span>
                    )}
                    {paySettings!.shift_exclude_keyword && (
                      <span className="text-destructive/70"> · excl. &ldquo;{paySettings!.shift_exclude_keyword}&rdquo;</span>
                    )}
                  </p>
                  <button
                    onClick={() => setPeriodOffset(o => Math.min(0, o + 1))}
                    className={`p-1 rounded hover:bg-muted transition-colors ${periodOffset >= 0 ? "opacity-30 pointer-events-none" : ""}`}
                  >
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
                </div>

                {shifts.length === 0 && !fetching ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No &ldquo;{paySettings!.shift_keyword}&rdquo; shifts this pay period.
                  </p>
                ) : (
                  <>
                    {/* Weekly hours breakdown */}
                    {weeklyHours.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours by Week</p>
                        {weeklyHours.map((week, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{week.label}</span>
                            <span className="font-medium tabular-nums">{week.hours.toFixed(1)} hrs</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* This paycheck */}
                    <div className="border-t pt-3 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Paycheck</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Hours</span>
                        <span className="font-medium tabular-nums">{totalHours.toFixed(1)} hrs</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. Gross</span>
                        <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">${grossPay.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. Net <span className="text-xs">(~{paySettings!.tax_rate}% tax)</span></span>
                        <span className="font-medium tabular-nums">${netPay.toFixed(2)}</span>
                      </div>
                      {payDate && (
                        <div className="flex justify-between text-xs pt-0.5">
                          <span className="text-muted-foreground">Pay date</span>
                          <span className="font-medium">{format(payDate, "MMM d")}</span>
                        </div>
                      )}
                    </div>

                    {/* Monthly estimate — only for current/upcoming periods */}
                    {netPay > 0 && (!payDate || payDate >= new Date()) && (
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Monthly Net</p>
                          <span className="text-sm font-medium tabular-nums">
                            {monthlyTotal !== null
                              ? `$${monthlyTotal.toFixed(2)}`
                              : `×${paychecksPerMonth} = $${monthlyNetEstimate.toFixed(2)}`}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          disabled={isPending}
                          onClick={() => {
                            const income = monthlyTotal ?? monthlyNetEstimate
                            startTransition(async () => {
                              const result = await setExpectedMonthlyIncome(income)
                              if (result?.error) {
                                toast.error(result.error)
                              } else {
                                toast.success(`Budget income set to $${income.toFixed(2)}/mo`)
                              }
                            })
                          }}
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Sync to budget
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
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
              <Label htmlFor="shift_keyword">Count shifts whose title contains</Label>
              <Input
                id="shift_keyword"
                placeholder="Work"
                value={shiftKeyword}
                onChange={(e) => setShiftKeyword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shift_exclude_keyword">
                Exclude if title also contains
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </Label>
              <Input
                id="shift_exclude_keyword"
                placeholder="e.g. a coworker's name"
                value={shiftExcludeKeyword}
                onChange={(e) => setShiftExcludeKeyword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use this to skip another person&apos;s schedule that shares the same keyword.
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

            <div className="space-y-1.5">
              <Label htmlFor="pay_delay_days">
                Days until paycheck after period ends
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </Label>
              <Input
                id="pay_delay_days"
                type="number"
                min="0"
                max="30"
                placeholder="0"
                value={payDelayDays}
                onChange={(e) => setPayDelayDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                e.g. 7 if you&apos;re paid one week after the period ends.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSaveSettings} disabled={isPending}>
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
