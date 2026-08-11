import { NextRequest, NextResponse } from "next/server"
import { getPaySettings, getShiftsForPayPeriod } from "@/lib/data"
import { computeCurrentPayPeriod } from "@/lib/pay-period"
import { getGoogleCalendarShiftsForPeriod, getCalDAVShiftsForPeriod } from "@/lib/calendar-period-events"
import { format } from "date-fns"

export async function GET(req: NextRequest) {
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10)
  const paySettings = await getPaySettings()

  if (!paySettings?.hourly_rate) {
    return NextResponse.json({ paySettings, shifts: [], periodStart: "", periodEnd: "" })
  }

  const { start, end } = computeCurrentPayPeriod(
    paySettings.pay_period,
    paySettings.pay_period_start_date,
    isNaN(offset) ? 0 : offset
  )
  const periodStart = format(start, "yyyy-MM-dd") + "T00:00:00"
  const periodEnd = format(end, "yyyy-MM-dd") + "T23:59:59"

  const [dbShifts, googleShifts, caldavShifts] = await Promise.all([
    getShiftsForPayPeriod(periodStart, periodEnd, paySettings.shift_keyword, paySettings.shift_exclude_keyword),
    getGoogleCalendarShiftsForPeriod(start, end, paySettings.shift_keyword, paySettings.shift_exclude_keyword),
    getCalDAVShiftsForPeriod(start, end, paySettings.shift_keyword, paySettings.shift_exclude_keyword),
  ])

  // Merge all sources, dedup by title+date
  const seen = new Set<string>()
  const shifts = [...dbShifts, ...googleShifts, ...caldavShifts]
    .filter((s) => {
      const key = `${s.title.toLowerCase()}|${s.start_at.slice(0, 10)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at))

  return NextResponse.json({ paySettings, shifts, periodStart, periodEnd })
}
