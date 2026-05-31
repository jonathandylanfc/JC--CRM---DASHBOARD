"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Mail, Check } from "lucide-react"
import { toast } from "sonner"

export function MorningBriefingButton() {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch("/api/briefing", { method: "GET" })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        setSent(true)
        toast.success(`Briefing sent to ${data.sentTo}`)
        setTimeout(() => setSent(false), 4000)
      }
    } catch {
      toast.error("Failed to send briefing")
    } finally {
      setSending(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 bg-transparent"
      onClick={handleSend}
      disabled={sending}
    >
      {sent ? <Check className="w-4 h-4 text-emerald-500" /> : <Mail className="w-4 h-4" />}
      {sending ? "Sending…" : sent ? "Sent!" : "Morning Briefing"}
    </Button>
  )
}
