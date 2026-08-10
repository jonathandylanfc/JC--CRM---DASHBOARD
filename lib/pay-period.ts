import { format, startOfWeek, addDays, getDaysInMonth } from "date-fns"

export type PayPeriodType = "weekly" | "biweekly" | "semimonthly"

export interface PayPeriod {
  start: Date
  end: Date
}

// offset: 0 = current period, -1 = previous, 1 = next, etc.
export function computeCurrentPayPeriod(
  payPeriod: PayPeriodType | string,
  periodStartDate: string | null,
  offset: number = 0
): PayPeriod {
  const today = new Date()

  if (payPeriod === "semimonthly") {
    const day = today.getDate()
    const year = today.getFullYear()
    const month = today.getMonth()
    const baseHalf = day <= 15 ? 0 : 1
    const totalHalves = baseHalf + offset
    const halfYear = year + Math.floor((month * 2 + totalHalves) / 24)
    const halfMonth = ((month * 2 + totalHalves) % 24 + 24) % 24
    const targetMonth = Math.floor(halfMonth / 2)
    const targetHalf = halfMonth % 2
    if (targetHalf === 0) {
      return {
        start: new Date(halfYear, targetMonth, 1),
        end: new Date(halfYear, targetMonth, 15, 23, 59, 59),
      }
    } else {
      return {
        start: new Date(halfYear, targetMonth, 16),
        end: new Date(halfYear, targetMonth, getDaysInMonth(new Date(halfYear, targetMonth)), 23, 59, 59),
      }
    }
  }

  const periodDays = payPeriod === "weekly" ? 7 : 14

  if (periodStartDate) {
    const baseStart = new Date(periodStartDate + "T12:00:00")
    const diffMs = today.getTime() - baseStart.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const periodsElapsed = Math.max(0, Math.floor(diffDays / periodDays)) + offset
    const start = new Date(baseStart)
    start.setDate(baseStart.getDate() + periodsElapsed * periodDays)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + periodDays - 1)
    end.setHours(23, 59, 59, 0)
    return { start, end }
  }

  // Default: start from most recent Monday + offset
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  monday.setHours(0, 0, 0, 0)
  const start = addDays(monday, offset * periodDays)
  const end = addDays(start, periodDays - 1)
  end.setHours(23, 59, 59, 0)
  return { start, end }
}

export function formatPayPeriodRange(start: Date, end: Date): string {
  const startFmt = format(start, "MMM d")
  const endFmt = start.getMonth() === end.getMonth()
    ? format(end, "d, yyyy")
    : format(end, "MMM d, yyyy")
  return `${startFmt} – ${endFmt}`
}
