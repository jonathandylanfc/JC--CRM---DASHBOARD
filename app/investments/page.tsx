import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { InvestmentsContent } from "@/components/investments/investments-content"
import { createClient } from "@/lib/supabase/server"
import { getUserProfile } from "@/lib/data"
import type { DayTrade } from "./day-trades-actions"


async function getInvestments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", user.id)
    .order("symbol")
  return data ?? []
}

async function getPrevCloseMap(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  // Get the two most recent distinct snapshot_dates so we can grab the previous close
  const today = new Date().toISOString().slice(0, 10)
  const { data: rows } = await supabase
    .from("investment_price_snapshots")
    .select("symbol, price, snapshot_date")
    .eq("user_id", user.id)
    .in("symbol", symbols)
    .lt("snapshot_date", today)      // strictly before today
    .not("snapshot_date", "is", null)
    .order("snapshot_date", { ascending: false })
    .limit(symbols.length * 5)       // enough rows to get the most recent per symbol

  if (!rows?.length) return {}

  // Pick the most recent row per symbol
  const map: Record<string, number> = {}
  for (const row of rows) {
    const sym = (row.symbol as string).toUpperCase()
    if (!(sym in map)) map[sym] = Number(row.price)
  }
  return map
}

async function getDayTrades(): Promise<DayTrade[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from("day_trades")
    .select("id, symbol, action, shares, price, total, traded_at, notes")
    .eq("user_id", user.id)
    .order("traded_at", { ascending: false })
  return (data ?? []) as DayTrade[]
}

export default async function InvestmentsPage() {
  const [investments, user, dayTrades] = await Promise.all([
    getInvestments(), getUserProfile(), getDayTrades(),
  ])

  const symbols = investments.map((i) => i.symbol.toUpperCase())
  const prevCloseMap = await getPrevCloseMap(symbols)

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64 pb-20 lg:pb-6">
        <Header
          title="Investments"
          description="Track your portfolio holdings and performance."
          user={user ?? undefined}
        />
        <div className="mt-6">
          <InvestmentsContent
            initialInvestments={investments}
            prevCloseMap={prevCloseMap}
            initialDayTrades={dayTrades}
          />
        </div>
      </main>
    </div>
  )
}
