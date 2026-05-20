import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { NetWorthContent } from "@/components/net-worth/net-worth-content"
import { getNetWorthEntries, getNetWorthHistory } from "@/lib/data"

export default async function NetWorthPage() {
  const [entries, history] = await Promise.all([
    getNetWorthEntries(),
    getNetWorthHistory(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6 lg:ml-64 pb-20 lg:pb-6">
        <Header title="Net Worth" description="Track your assets and liabilities over time." />
        <div className="mt-6">
          <NetWorthContent initialEntries={entries} initialHistory={history} />
        </div>
      </main>
    </div>
  )
}
