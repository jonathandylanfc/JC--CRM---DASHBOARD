import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { InvestmentsContent } from "@/components/investments/investments-content"
import { createClient } from "@/lib/supabase/server"
import { getUserProfile } from "@/lib/data"

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
