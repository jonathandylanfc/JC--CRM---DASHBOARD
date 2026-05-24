"use client"

import { useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@/components/ui/button"
import { Loader2, Link2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  onSuccess?: () => void
}

export function PlaidInvestmentsConnect({ onSuccess }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetch("/api/plaid/create-link-token-investments", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.link_token) setLinkToken(d.link_token)
        else toast.error("Could not initialize Plaid. Make sure Investments is enabled in your Plaid dashboard.")
      })
      .catch(() => toast.error("Failed to connect to Plaid"))
      .finally(() => setLoading(false))
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (public_token, metadata) => {
      setConnecting(true)
      try {
        // Exchange token (reuse existing endpoint — stores the item)
        const exchangeRes = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token,
            institution: metadata.institution
              ? { name: metadata.institution.name, institution_id: metadata.institution.institution_id }
              : null,
          }),
        })
        const exchangeData = await exchangeRes.json()
        if (exchangeData.error) { toast.error(exchangeData.error); return }

        toast.success(`${metadata.institution?.name ?? "Brokerage"} connected! Syncing holdings…`)

        // Sync investment holdings
        const syncRes = await fetch("/api/plaid/investments-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const syncData = await syncRes.json()

        if (syncData.count > 0) {
          toast.success(`Synced ${syncData.count} holding${syncData.count !== 1 ? "s" : ""}`)
        } else {
          toast.info("Connected! No holdings found — your broker may take a moment to share data.")
        }

        onSuccess?.()
      } finally {
        setConnecting(false)
      }
    },
    onExit: (err) => {
      if (err) toast.error("Plaid connection closed with an error")
    },
  })

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 bg-transparent"
      onClick={() => open()}
      disabled={!ready || loading || connecting}
    >
      {loading || connecting
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Link2 className="w-4 h-4" />}
      {connecting ? "Syncing…" : "Connect via Plaid"}
    </Button>
  )
}
