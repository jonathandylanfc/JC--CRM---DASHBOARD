"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, Building2, AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface PlaidItem {
  id: string
  item_id: string
  institution_name: string
  created_at: string
}

export function ConnectedBrokerages() {
  const router = useRouter()
  const [items, setItems] = useState<PlaidItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmItem, setConfirmItem] = useState<PlaidItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchItems() {
    const res = await fetch("/api/plaid/investment-items")
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [])

  async function handleDisconnect() {
    if (!confirmItem) return
    setDeleting(true)
    try {
      const res = await fetch("/api/plaid/investment-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: confirmItem.item_id }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`${confirmItem.institution_name} disconnected`)
        setItems((prev) => prev.filter((i) => i.item_id !== confirmItem.item_id))
        setConfirmItem(null)
        router.refresh()
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading || items.length === 0) return null

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Connected Accounts</h3>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div
              key={item.item_id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm"
            >
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{item.institution_name}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · connected {new Date(item.created_at).toLocaleDateString()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-muted-foreground hover:text-destructive ml-1"
                onClick={() => setConfirmItem(item)}
                title="Disconnect"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!confirmItem} onOpenChange={(o) => { if (!o) setConfirmItem(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Disconnect {confirmItem?.institution_name}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This removes the Plaid connection. Your existing holdings won&apos;t be deleted — only the sync link will be removed.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setConfirmItem(null)}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleDisconnect} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
