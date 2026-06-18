import { SidebarServer as Sidebar } from "@/components/dashboard/sidebar-server"
import { Header } from "@/components/dashboard/header"
import { SettingsContent } from "@/components/settings/settings-content"
import { getUserProfile } from "@/lib/data"
import { createClient } from "@/lib/supabase/server"

async function getProfileToggles() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { showInvestments: true, showNasaApod: true }
  const { data } = await supabase.from("profiles").select("show_investments, show_nasa_apod").eq("id", user.id).single()
  return {
    showInvestments: data?.show_investments ?? true,
    showNasaApod: data?.show_nasa_apod ?? true,
  }
}

export default async function SettingsPage() {
  const [user, toggles] = await Promise.all([getUserProfile(), getProfileToggles()])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64 pb-20 lg:pb-6">
        <Header title="Settings" description="Manage your account preferences and application settings." />

        <div className="mt-6">
          <SettingsContent
            initialName={user?.name ?? ""}
            initialEmail={user?.email ?? ""}
            initialAvatarUrl={user?.avatar_url ?? null}
            initialShowInvestments={toggles.showInvestments}
            initialShowNasaApod={toggles.showNasaApod}
          />
        </div>
      </main>
    </div>
  )
}
