"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function upsertNetWorthEntry(id: string | null, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const payload = {
    user_id: user.id,
    name: (formData.get("name") as string).trim(),
    type: formData.get("type") as string,
    amount: parseFloat(formData.get("amount") as string),
    category: (formData.get("category") as string) || null,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from("net_worth_entries").update(payload).eq("id", id).eq("user_id", user.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from("net_worth_entries").insert(payload)
    if (error) return { error: error.message }
  }

  // Snapshot today's net worth
  await snapshotNetWorth(supabase, user.id)

  revalidatePath("/net-worth")
  return { success: true }
}

export async function deleteNetWorthEntry(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const { error } = await supabase.from("net_worth_entries").delete().eq("id", id).eq("user_id", user.id)
  if (error) return { error: error.message }
  await snapshotNetWorth(supabase, user.id)
  revalidatePath("/net-worth")
  return { success: true }
}

async function snapshotNetWorth(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>, userId: string) {
  const { data } = await supabase.from("net_worth_entries").select("type, amount").eq("user_id", userId)
  if (!data) return
  const assets = data.filter((e) => e.type === "asset").reduce((s, e) => s + Number(e.amount), 0)
  const liabilities = data.filter((e) => e.type === "liability").reduce((s, e) => s + Number(e.amount), 0)
  const net_worth = assets - liabilities
  await supabase.from("net_worth_history").upsert(
    { user_id: userId, net_worth, recorded_at: new Date().toISOString().split("T")[0] },
    { onConflict: "user_id,recorded_at" }
  )
}
