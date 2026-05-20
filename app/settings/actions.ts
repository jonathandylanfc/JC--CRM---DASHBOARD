"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const full_name = (formData.get("full_name") as string)?.trim()
  const avatarFile = formData.get("avatar") as File | null

  let avatar_url: string | undefined

  // Upload avatar if provided
  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > 2 * 1024 * 1024) return { error: "Image must be under 2MB" }

    const ext = avatarFile.name.split(".").pop()
    const path = `${user.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })

    if (uploadError) return { error: uploadError.message }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path)
    avatar_url = publicUrl
  }

  // Update profiles table
  const updates: Record<string, string> = {}
  if (full_name) updates.full_name = full_name
  if (avatar_url) updates.avatar_url = avatar_url

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...updates }, { onConflict: "id" })
    if (error) return { error: error.message }
  }

  revalidatePath("/settings")
  revalidatePath("/")
  return { success: true }
}
