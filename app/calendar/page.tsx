import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { CalendarContent } from "@/components/calendar/calendar-content"
import { PaycheckCard } from "@/components/calendar/paycheck-card"
import { getUserProfile, getPaySettings, getShiftsForPayPeriod } from "@/lib/data"
import { computeCurrentPayPeriod } from "@/lib/pay-period"
import { format } from "date-fns"

export default async function CalendarPage() {
  const [user, paySettings] = await Promise.all([
    getUserProfile(),
    getPaySettings(),
  ])

  let shifts: Awaited<ReturnType<typeof getShiftsForPayPeriod>> = []
  let periodStart = ""
  let periodEnd = ""

  if (paySettings?.hourly_rate) {
    const { start, end } = computeCurrentPayPeriod(
      paySettings.pay_period,
      paySettings.pay_period_start_date
    )
    periodStart = format(start, "yyyy-MM-dd") + "T00:00:00"
    periodEnd = format(end, "yyyy-MM-dd") + "T23:59:59"
    shifts = await getShiftsForPayPeriod(periodStart, periodEnd, paySettings.shift_keyword)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-3 md:p-4 lg:p-5 lg:ml-64 pb-20 lg:pb-5">
        <Header
          title="Calendar"
          description="Schedule and track your events and meetings."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <PaycheckCard
            paySettings={paySettings}
            shifts={shifts}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <CalendarContent />
        </div>
      </main>
    </div>
  )
}
