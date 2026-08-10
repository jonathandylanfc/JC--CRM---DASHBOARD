import { NextResponse } from "next/server"
import { getPaySettings, getShiftsForPayPeriod } from "@/lib/data"
import { computeCurrentPayPeriod } from "@/lib/pay-period"
import { format } from "date-fns"

export async function GET() {
  const paySettings = await getPaySettings()

  if (!paySettings?.hourly_rate) {
    return NextResponse.json({ paySettings, shifts: [], periodStart: "", periodEnd: "" })
  }

  const { start, end } = computeCurrentPayPeriod(
    paySettings.pay_period,
    paySettings.pay_period_start_date
  )
  const periodStart = format(start, "yyyy-MM-dd") + "T00:00:00"
  const periodEnd = format(end, "yyyy-MM-dd") + "T23:59:59"

  const shifts = await getShiftsForPayPeriod(periodStart, periodEnd, paySettings.shift_keyword, paySettings.shift_exclude_keyword)

  return NextResponse.json({ paySettings, shifts, periodStart, periodEnd })
}
