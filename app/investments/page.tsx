import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { InvestmentsContent } from "@/components/investments/investments-content"
import { createClient } from "@/lib/supabase/server"
import { getUserProfile } from "@/lib/data"
import { refreshPrices } from "./actions"

async function getDividends(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("dividends")
    .select("*")
    .eq("user_id", userId)
    .order("symbol")
  return data ?? []
}

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

export default async function InvestmentsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const [investments, user] = await Promise.all([getInvestments(), getUserProfile()])

  // Auto-refresh prices if any holding has no price or was last updated over 1 hour ago
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const needsRefresh = investments.some(
    (inv) => !inv.current_price || (inv.updated_at && inv.updated_at < oneHourAgo)
  )
  let finalInvestments = investments
  if (needsRefresh && investments.length > 0) {
    await refreshPrices()
    finalInvestments = await getInvestments()
  }

  const symbols = finalInvestments.map((i) => i.symbol.toUpperCase())
  const [prevCloseMap, dividends] = await Promise.all([
    getPrevCloseMap(symbols),
    authUser ? getDividends(authUser.id) : Promise.resolve([]),
  ])

  return <InvestmentsPageUI investments={finalInvestments} user={user} prevCloseMap={prevCloseMap} dividends={dividends} />
}

function InvestmentsPageUI({
  investments,
  user,
  prevCloseMap,
  dividends,
}: {
  investments: Awaited<ReturnType<typeof getInvestments>>
  user: Awaited<ReturnType<typeof getUserProfile>>
  prevCloseMap: Record<string, number>
  dividends: Awaited<ReturnType<typeof getDividends>>
}) {
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
            initialDividends={dividends}
          />
        </div>
      </main>
    </div>
  )
}
