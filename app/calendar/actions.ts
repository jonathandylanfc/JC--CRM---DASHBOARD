"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function updatePaySettings(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const hourlyRateRaw = formData.get("hourly_rate") as string
  const payPeriod = (formData.get("pay_period") as string) || "biweekly"
  const shiftKeyword = (formData.get("shift_keyword") as string)?.trim() || "Work"
  const shiftExcludeKeyword = (formData.get("shift_exclude_keyword") as string)?.trim() || null
  const taxRateRaw = formData.get("tax_rate") as string
  const periodStartDate = (formData.get("pay_period_start_date") as string) || null
  const payDelayDaysRaw = formData.get("pay_delay_days") as string

  const hourlyRate = hourlyRateRaw ? parseFloat(hourlyRateRaw) : null
  const taxRate = taxRateRaw ? parseFloat(taxRateRaw) : 25
  const payDelayDays = payDelayDaysRaw ? parseInt(payDelayDaysRaw, 10) : 0

  if (hourlyRate !== null && (isNaN(hourlyRate) || hourlyRate < 0)) {
    return { error: "Invalid hourly rate" }
  }
  if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: "Tax rate must be 0–100" }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      hourly_rate: hourlyRate,
      pay_period: payPeriod,
      shift_keyword: shiftKeyword,
      shift_exclude_keyword: shiftExcludeKeyword,
      tax_rate: taxRate,
      pay_period_start_date: periodStartDate || null,
      pay_delay_days: isNaN(payDelayDays) || payDelayDays < 0 ? 0 : payDelayDays,
    })
    .eq("id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}
