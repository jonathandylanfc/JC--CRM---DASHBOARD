import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { SettingsContent } from "@/components/settings/settings-content"
import { getUserProfile } from "@/lib/data"

export default async function SettingsPage() {
  const user = await getUserProfile()

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64">
        <Header title="Settings" description="Manage your account preferences and application settings." />

        <div className="mt-6">
          <SettingsContent
            initialName={user?.name ?? ""}
            initialEmail={user?.email ?? ""}
            initialAvatarUrl={user?.avatar_url ?? null}
          />
        </div>
      </main>
    </div>
  )
}
