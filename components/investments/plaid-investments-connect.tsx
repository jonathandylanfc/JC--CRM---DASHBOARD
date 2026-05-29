"use client"

import { useEffect, useRef, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@/components/ui/button"
import { Loader2, Link2, RefreshCw, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

interface Props {
  onSuccess?: () => void
  hasBrokerage?: boolean
}

export function PlaidInvestmentsConnect({ onSuccess, hasBrokerage = false }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenError, setTokenError] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Re-auth state: set when ADDITIONAL_CONSENT_REQUIRED is returned
  const [reauthItemId, setReauthItemId] = useState<string | null>(null)
  const [reauthInstitution, setReauthInstitution] = useState<string>("")
  const [reauthLoading, setReauthLoading] = useState(false)
  // When true and ready, auto-open Link for re-auth
  const autoOpenRef = useRef(false)

  async function handleManualSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/plaid/investments-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.error) {
        if (data.error.includes("PRODUCT_NOT_READY")) {
          toast.info("Still loading — try again in a minute.", { duration: 5000 })
        } else if (data.error.includes("ADDITIONAL_CONSENT_REQUIRED")) {
          // Surface the re-authorize button for the specific item that needs consent
          if (data.item_id) {
            setReauthItemId(data.item_id)
            setReauthInstitution(
              data.error.includes("E*TRADE") ? "E*TRADE from Morgan Stanley" : "Your brokerage"
            )
          }
          toast.warning("Investment access not authorized — click Re-authorize below.", { duration: 6000 })
        } else {
          toast.error(`Sync failed: ${data.error}`)
        }
      } else if (data.count > 0) {
        toast.success(`Synced ${data.count} holding${data.count !== 1 ? "s" : ""}`)
        onSuccess?.()
      } else {
        toast.info("No holdings returned yet — try again in a moment.")
      }
    } finally {
      setSyncing(false)
    }
  }

  // Fetch update-mode link token for re-authorization
  async function startReauth(itemId: string, institution: string) {
    setReauthLoading(true)
    try {
      const res = await fetch("/api/plaid/create-link-token-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      const data = await res.json()
      if (data.link_token) {
        autoOpenRef.current = true
        setLinkToken(data.link_token)
        setReauthInstitution(institution)
      } else {
        toast.error("Could not start re-authorization. Try reconnecting.")
      }
    } catch {
      toast.error("Could not start re-authorization.")
    } finally {
      setReauthLoading(false)
    }
  }

  // Load the initial link token for new connections
  useEffect(() => {
    fetch("/api/plaid/create-link-token-investments", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.link_token) { setLinkToken(d.link_token); setTokenError(false) }
        else setTokenError(true)
      })
      .catch(() => setTokenError(true))
      .finally(() => setLoading(false))
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (public_token, metadata) => {
      autoOpenRef.current = false
      const isReauth = !!reauthItemId

      setConnecting(true)
      try {
        if (!isReauth) {
          // New connection — exchange token
          const exchangeRes = await fetch("/api/plaid/exchange-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token,
              institution: metadata.institution
                ? { name: metadata.institution.name, institution_id: metadata.institution.institution_id }
                : null,
              is_investment_item: true,
            }),
          })
          const exchangeData = await exchangeRes.json()
          if (exchangeData.error) { toast.error(exchangeData.error); return }
          toast.success(`${metadata.institution?.name ?? "Brokerage"} connected! Syncing holdings…`)
        } else {
          // Re-auth — Plaid updates the existing item automatically; no exchange needed
          toast.success(`${reauthInstitution} re-authorized! Syncing holdings…`)
          setReauthItemId(null)
        }

        // Sync investment holdings
        const syncRes = await fetch("/api/plaid/investments-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const syncData = await syncRes.json()

        if (syncData.error) {
          if (syncData.error.includes("PRODUCT_NOT_READY")) {
            toast.info("Your brokerage is still loading — check back in a few minutes and hit Sync Holdings.", { duration: 6000 })
          } else if (syncData.error.includes("ADDITIONAL_CONSENT_REQUIRED")) {
            // Still needs consent — offer re-auth
            if (syncData.item_id) {
              setReauthItemId(syncData.item_id)
              setReauthInstitution(metadata.institution?.name ?? "Brokerage")
            }
            toast.warning(
              `${metadata.institution?.name ?? "Your brokerage"} needs investment access. Click "Re-authorize" to grant it.`,
              { duration: 8000 }
            )
          } else {
            toast.error(`Could not load holdings: ${syncData.error}`)
          }
        } else if (syncData.count > 0) {
          toast.success(`Synced ${syncData.count} holding${syncData.count !== 1 ? "s" : ""}`)
        } else {
          toast.info("Connected but no holdings returned yet — try Sync Holdings in a few minutes.")
        }

        onSuccess?.()
      } finally {
        setConnecting(false)
      }
    },
    onExit: (err) => {
      autoOpenRef.current = false
      if (err) toast.error("Plaid connection closed with an error")
    },
  })

  // Auto-open Link when a re-auth token is ready
  useEffect(() => {
    if (autoOpenRef.current && ready) {
      open()
    }
  }, [ready, open])

  if (tokenError) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-transparent text-muted-foreground"
        disabled
        title="Enable the Investments product in your Plaid dashboard to use this feature"
      >
        <Link2 className="w-4 h-4" />
        Plaid Investments not enabled
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Re-authorize button — shown when ADDITIONAL_CONSENT_REQUIRED */}
      {reauthItemId && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-transparent border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
          onClick={() => startReauth(reauthItemId, reauthInstitution)}
          disabled={reauthLoading || connecting}
        >
          {reauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
          Re-authorize
        </Button>
      )}

      {hasBrokerage && !reauthItemId && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-transparent"
          onClick={handleManualSync}
          disabled={syncing}
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="hidden sm:inline">Sync Holdings</span>
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-transparent"
        onClick={() => open()}
        disabled={!ready || loading || connecting || reauthLoading}
      >
        {loading || connecting
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Link2 className="w-4 h-4" />}
        {connecting ? "Connecting…" : "Connect via Plaid"}
      </Button>
    </div>
  )
}
