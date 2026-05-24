import { createClient } from "@/lib/supabase/server"
import { BottomNav } from "./bottom-nav"

export async function BottomNavServer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let showInvestments = true

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("show_investments")
      .eq("id", user.id)
      .single()
    if (data?.show_investments === false) showInvestments = false
  }

  return <BottomNav showInvestments={showInvestments} />
}
