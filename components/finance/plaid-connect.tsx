"use client"

import { useCallback, useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Loader2, RefreshCw, Trash2, Building2, Plus } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

interface PlaidAccount {
  id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
}

interface PlaidItem {
  id: string
  item_id: string
  institution_name: string | null
  plaid_accounts: PlaidAccount[]
  plaid_sync_cursors: { last_synced_at: string | null }[]
}

interface Props {
  onSync?: () => void
}

function ConnectButton({ onSuccess }: { onSuccess: (publicToken: string, institution: { name: string; institution_id: string } | null) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { setLinkToken(d.link_token); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: (public_token, metadata) => {
      onSuccess(public_token, metadata.institution ? {
        name: metadata.institution.name,
        institution_id: metadata.institution.institution_id,
      } : null)
    },
  })

  return (
    <Button
      onClick={() => open()}
      disabled={!ready || loading}
      className="gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      Connect Bank
    </Button>
  )
}

export function PlaidConnect({ onSync }: Props) {
  const [items, setItems] = useState<PlaidItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<PlaidItem | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/plaid/sync")
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleSuccess(publicToken: string, institution: { name: string; institution_id: string } | null) {
    setConnecting(true)
    try {
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken, institution }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }

      toast.success(`${institution?.name ?? "Bank"} connected! Syncing transactions…`)
      await fetchItems()

      // Auto-sync after connecting
      const syncRes = await fetch("/api/plaid/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const syncData = await syncRes.json()
      toast.success(`Synced ${syncData.count} transactions`)
      onSync?.()
      await fetchItems()
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync(itemId?: string) {
    setSyncing(itemId ?? "all")
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId ? { item_id: itemId } : {}),
      })
      const data = await res.json()
      toast.success(`Synced ${data.count} new transaction${data.count !== 1 ? "s" : ""}`)
      onSync?.()
      await fetchItems()
    } finally {
      setSyncing(null)
    }
  }

  async function confirmDisconnect(deleteTransactions: boolean) {
    if (!disconnectTarget) return
    setDisconnecting(true)
    try {
      await fetch("/api/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: disconnectTarget.item_id, delete_transactions: deleteTransactions }),
      })
      toast.success(
        deleteTransactions
          ? `${disconnectTarget.institution_name ?? "Bank"} disconnected and transactions deleted`
          : `${disconnectTarget.institution_name ?? "Bank"} disconnected`
      )
      setDisconnectTarget(null)
      onSync?.()
      fetchItems()
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading connected banks…</div>

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const lastSynced = item.plaid_sync_cursors?.[0]?.last_synced_at
            const isSyncing = syncing === item.item_id || syncing === "all"
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{item.institution_name ?? "Bank"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.plaid_accounts.map((a) => `${a.name}${a.mask ? ` ••${a.mask}` : ""}`).join(" · ")}
                      </p>
                      {lastSynced && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last synced {format(new Date(lastSynced), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => handleSync(item.item_id)}
                      disabled={!!syncing}
                      title="Sync transactions"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDisconnectTarget(item)}
                      title="Disconnect"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <ConnectButton onSuccess={handleSuccess} />
        {items.length > 0 && (
          <Button variant="outline" onClick={() => handleSync()} disabled={!!syncing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing === "all" ? "animate-spin" : ""}`} />
            Sync All
          </Button>
        )}
        {connecting && <span className="text-xs text-muted-foreground">Connecting…</span>}
      </div>

      <AlertDialog open={!!disconnectTarget} onOpenChange={(o) => { if (!o && !disconnecting) setDisconnectTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget?.institution_name ?? "Bank"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you also want to delete all transactions imported from{" "}
              <span className="font-medium text-foreground">{disconnectTarget?.institution_name ?? "this bank"}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={disconnecting}
              onClick={() => confirmDisconnect(false)}
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Disconnect only
            </Button>
            <Button
              variant="destructive"
              disabled={disconnecting}
              onClick={() => confirmDisconnect(true)}
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Disconnect &amp; delete transactions
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
