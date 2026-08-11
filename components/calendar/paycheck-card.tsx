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
import { DollarSign, Settings, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
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
  // Unpaid break deductions
  if (raw >= 8) return raw - 1    // 8+ hours → 1 hr unpaid lunch
  if (raw >= 6) return raw - 0.5  // 6–8 hours → 30 min unpaid lunch
  return raw
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
  const [periodOffset, setPeriodOffset] = useState(0)

  // Settings form state — seeded from initial props
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
      setPaySettings(data.paySettings)

      const pStart: string = data.periodStart ?? ""
      const pEnd: string = data.periodEnd ?? ""
      setPeriodStart(pStart)
      setPeriodEnd(pEnd)

      if (!pStart || !pEnd || !data.paySettings?.hourly_rate) {
        setShifts(data.shifts ?? [])
        return
      }

      const kw = (data.paySettings.shift_keyword ?? "work").toLowerCase()
      const excKw = (data.paySettings.shift_exclude_keyword ?? "").toLowerCase().trim()

      function matchesKeyword(title: string): boolean {
        const t = title.toLowerCase()
        if (!t.includes(kw)) return false
        if (excKw && t.includes(excKw)) return false
        return true
      }

      // Compare by YYYY-MM-DD string to avoid timezone/all-day event issues
      function inPeriod(start: string | null | undefined): boolean {
        if (!start) return false
        const d = start.slice(0, 10)
        return d >= pStart.slice(0, 10) && d <= pEnd.slice(0, 10)
      }

      // Fetch from all three calendar sources the calendar view uses
      const [gRes, caldavRes, icsRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/calendar/caldav"),
        fetch("/api/calendar/ics"),
      ])
      const gData = gRes.ok ? await gRes.json() : {}
      const caldavData = caldavRes.ok ? await caldavRes.json() : {}
      const icsData = icsRes.ok ? await icsRes.json() : {}

      type RawEvent = { id?: string | null; title: string; start: string | null; end?: string | null; allDay?: boolean }
      const externalShifts: Shift[] = [
        ...(gData.events ?? []) as RawEvent[],
        ...(caldavData.events ?? []) as RawEvent[],
        ...(icsData.events ?? []) as RawEvent[],
      ]
        .filter((e) => inPeriod(e.start) && matchesKeyword(e.title))
        .map((e) => ({
          id: e.id ?? `ext-${e.start}`,
          title: e.title,
          start_at: e.start!,
          end_at: e.end ?? null,
          all_day: e.allDay ?? false,
        }))

      // Merge local DB shifts + external, dedup by title+date
      const seen = new Set<string>()
      const merged = [...(data.shifts ?? []), ...externalShifts].filter((s: Shift) => {
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

  // Fetch on mount and whenever offset changes
  useEffect(() => {
    fetchShifts(periodOffset)
  }, [fetchShifts, periodOffset])

  // Re-fetch whenever CalendarContent mutates local events
  useEffect(() => {
    const handler = () => fetchShifts(periodOffset)
    window.addEventListener("localShiftsChanged", handler)
    return () => window.removeEventListener("localShiftsChanged", handler)
  }, [fetchShifts, periodOffset])

  const isConfigured = paySettings?.hourly_rate != null && paySettings.hourly_rate > 0

  const totalHours = shifts.reduce((sum, s) => sum + hoursFromShift(s), 0)
  const grossPay = totalHours * (paySettings?.hourly_rate ?? 0)
  const netPay = grossPay * (1 - (paySettings?.tax_rate ?? 25) / 100)

  const periodLabel = periodStart && periodEnd
    ? formatPayPeriodRange(new Date(periodStart), new Date(periodEnd))
    : ""

  const payDate = (() => {
    if (!periodEnd || !(paySettings?.pay_delay_days)) return null
    const d = new Date(periodEnd)
    d.setDate(d.getDate() + paySettings.pay_delay_days)
    return d
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPeriodOffset((o) => o - 1)}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                      title="Previous period"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{periodLabel}</span>
                      {periodOffset < 0 && <span className="text-muted-foreground"> · past</span>}
                      {paySettings!.shift_exclude_keyword && (
                        <span className="text-destructive/70"> · excl. &ldquo;{paySettings!.shift_exclude_keyword}&rdquo;</span>
                      )}
                    </p>
                    <button
                      onClick={() => setPeriodOffset((o) => Math.min(0, o + 1))}
                      className={`p-0.5 rounded hover:bg-muted transition-colors ${periodOffset >= 0 ? "opacity-30 pointer-events-none" : ""}`}
                      title="Next period"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                {shifts.length === 0 && (
                  <p className="text-sm text-muted-foreground py-1">
                    No &ldquo;{paySettings!.shift_keyword}&rdquo; shifts this pay period.
                  </p>
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
                  {payDate && (
                    <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-muted-foreground">Pay date</span>
                      <span className="font-medium">{format(payDate, "MMM d")}</span>
                    </div>
                  )}
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
