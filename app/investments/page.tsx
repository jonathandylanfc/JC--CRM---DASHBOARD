import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { InvestmentsContent } from "@/components/investments/investments-content"
import { createClient } from "@/lib/supabase/server"
import { getUserProfile } from "@/lib/data"
import { refreshPrices } from "./actions"

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

export default async function InvestmentsPage() {
  const [investments, user] = await Promise.all([getInvestments(), getUserProfile()])

  // Auto-refresh prices if any holding has no price or was last updated over 1 hour ago
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const needsRefresh = investments.some(
    (inv) => !inv.current_price || (inv.updated_at && inv.updated_at < oneHourAgo)
  )
  if (needsRefresh && investments.length > 0) {
    await refreshPrices()
    // Re-fetch with fresh prices
    const fresh = await getInvestments()
    return <InvestmentsPageUI investments={fresh} user={user} />
  }

  return <InvestmentsPageUI investments={investments} user={user} />
}

function InvestmentsPageUI({
  investments,
  user,
}: {
  investments: Awaited<ReturnType<typeof getInvestments>>
  user: Awaited<ReturnType<typeof getUserProfile>>
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
          <InvestmentsContent initialInvestments={investments} />
        </div>
      </main>
    </div>
  )
}
