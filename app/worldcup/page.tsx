import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { WorldCupContent } from "@/components/worldcup/worldcup-content"
import { getUserProfile } from "@/lib/data"

export default async function WorldCupPage() {
  const user = await getUserProfile()

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64 pb-20 lg:pb-6">
        <Header
          title="World Cup"
          description="2026 FIFA World Cup · Live scores, standings, and rankings"
          user={user ?? undefined}
        />
        <div className="mt-6">
          <WorldCupContent />
        </div>
      </main>
    </div>
  )
}
