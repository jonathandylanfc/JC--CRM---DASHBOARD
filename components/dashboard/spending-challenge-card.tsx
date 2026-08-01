"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Trash2, Trophy, CalendarClock, TrendingUp, RefreshCw, Link } from "lucide-react"
import { toast } from "sonner"
import { format, differenceInDays, parseISO } from "date-fns"
import {
  saveSpendingChallenge,
  updateSpentAmount,
  deleteSpendingChallenge,
  type SpendingChallenge,
} from "@/app/finance/spending-challenge-actions"

interface Props {
  initialChallenges: SpendingChallenge[]
  plaidAccounts: string[]
}

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function SpendingChallengeCard({ initialChallenges, plaidAccounts }: Props) {
  const router = useRouter()
  const [challenges, setChallenges] = useState(initialChallenges)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [form, setForm] = useState({
    card_name: "",
    bonus_description: "",
    spend_target: "",
    spent_amount: "",
    enrolled_at: "",
    deadline: "",
    linked_account: "",
  })

  function openNew() {
    setForm({
      card_name: "",
      bonus_description: "",
      spend_target: "",
      spent_amount: "0",
      enrolled_at: "",
      deadline: "",
      linked_account: "",
    })
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(c: SpendingChallenge) {
    setForm({
      card_name: c.card_name,
      bonus_description: c.bonus_description,
      spend_target: String(c.spend_target),
      spent_amount: String(c.spent_amount),
      enrolled_at: c.enrolled_at,
      deadline: c.deadline,
      linked_account: c.linked_account ?? "",
    })
    setEditingId(c.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.card_name || !form.spend_target || !form.enrolled_at || !form.deadline) {
      toast.error("Fill in all required fields")
      return
    }
    setSaving(true)

    if (editingId) {
      // Update spent amount (manual) or just save linked account change
      const res = await updateSpentAmount(editingId, Number(form.spent_amount) || 0)
      if (res.error) { toast.error(res.error); setSaving(false); return }
      toast.success("Updated")
      router.refresh()
    } else {
      const res = await saveSpendingChallenge({
        card_name: form.card_name,
        bonus_description: form.bonus_description,
        spend_target: Number(form.spend_target),
        enrolled_at: form.enrolled_at,
        deadline: form.deadline,
        linked_account: form.linked_account || null,
      })
      if (res.error) { toast.error(res.error); setSaving(false); return }
      toast.success("Challenge added — spend is auto-tracked from your linked account")
      router.refresh()
    }
    setSaving(false)
    setDialogOpen(false)
  }

  async function handleDelete(id: string) {
    const res = await deleteSpendingChallenge(id)
    if (res.error) { toast.error(res.error); return }
    setChallenges((prev) => prev.filter((c) => c.id !== id))
    toast.success("Removed")
  }

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  const today = new Date()

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Trophy className="w-4 h-4 text-amber-500" />
            Card Bonus Challenges
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={handleRefresh} title="Refresh from Plaid">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" className="gap-1 bg-transparent h-7 text-xs" onClick={openNew}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </div>

        {challenges.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No active challenges — add one to track your progress toward a signup bonus.
          </p>
        ) : (
          <div className="space-y-5">
            {challenges.map((c) => {
              const deadline = parseISO(c.deadline)
              const daysLeft = differenceInDays(deadline, today)
              const pct = Math.min(100, Math.round((c.spent_amount / c.spend_target) * 100))
              const remaining = Math.max(0, c.spend_target - c.spent_amount)
              const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : 0
              const isComplete = c.spent_amount >= c.spend_target
              const isExpired = daysLeft < 0 && !isComplete

              return (
                <div key={c.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{c.card_name}</p>
                      {c.bonus_description && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{c.bonus_description}</p>
                      )}
                      {c.linked_account && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Link className="w-3 h-3" />
                          {c.linked_account}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.linked_account && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => openEdit(c)}>
                          Update
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                        {currency(c.spent_amount)}{" "}
                        <span className="font-normal text-muted-foreground">of {currency(c.spend_target)}</span>
                      </span>
                      <span className={`font-medium ${isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-500" : isExpired ? "bg-rose-500" : "bg-amber-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-muted-foreground">Remaining</p>
                      <p className="font-semibold">{isComplete ? "Done! 🎉" : currency(remaining)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-muted-foreground flex items-center justify-center gap-1">
                        <CalendarClock className="w-3 h-3" /> Days left
                      </p>
                      <p className={`font-semibold ${daysLeft <= 14 && !isComplete ? "text-rose-500" : ""}`}>
                        {isExpired ? "Expired" : isComplete ? "—" : daysLeft}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-muted-foreground flex items-center justify-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Per day
                      </p>
                      <p className="font-semibold">
                        {isComplete || isExpired ? "—" : currency(dailyNeeded)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Enrolled {format(parseISO(c.enrolled_at), "MMM d, yyyy")} · Deadline {format(deadline, "MMM d, yyyy")}
                    {c.linked_account && " · auto-updated from Plaid"}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Update Progress" : "Add Bonus Challenge"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            {!editingId && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Card name</Label>
                  <Input
                    placeholder="Chase Sapphire Preferred"
                    value={form.card_name}
                    onChange={(e) => setForm((f) => ({ ...f, card_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bonus</Label>
                  <Input
                    placeholder="100,000 bonus points"
                    value={form.bonus_description}
                    onChange={(e) => setForm((f) => ({ ...f, bonus_description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Spend target ($)</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={form.spend_target}
                    onChange={(e) => setForm((f) => ({ ...f, spend_target: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Enrolled date</Label>
                    <Input
                      type="date"
                      value={form.enrolled_at}
                      onChange={(e) => setForm((f) => ({ ...f, enrolled_at: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Deadline</Label>
                    <Input
                      type="date"
                      value={form.deadline}
                      onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plaid account (auto-tracks spending)</Label>
                  {plaidAccounts.length > 0 ? (
                    <Select
                      value={form.linked_account}
                      onValueChange={(v) => setForm((f) => ({ ...f, linked_account: v === "_none" ? "" : v }))}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select your Chase account…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None (manual tracking)</SelectItem>
                        {plaidAccounts.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No Plaid accounts found — connect your Chase card in Finance first.
                    </p>
                  )}
                </div>
                {!form.linked_account && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Already spent ($) <span className="text-muted-foreground">(manual)</span></Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={form.spent_amount}
                      onChange={(e) => setForm((f) => ({ ...f, spent_amount: e.target.value }))}
                    />
                  </div>
                )}
              </>
            )}
            {editingId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Amount spent so far ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.spent_amount}
                  onChange={(e) => setForm((f) => ({ ...f, spent_amount: e.target.value }))}
                  autoFocus
                />
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update" : "Add Challenge"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
