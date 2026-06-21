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
      <main
        className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64 pb-20 lg:pb-6 relative"
        style={{
          backgroundImage: "url('/brazil-flag.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm pointer-events-none" />
        <div className="relative z-10">
          <Header
            title="World Cup"
            description="2026 FIFA World Cup · Live scores, standings, and rankings"
            user={user ?? undefined}
          />
          <div className="mt-6">
            <WorldCupContent />
          </div>
        </div>
      </main>
    </div>
  )
}
