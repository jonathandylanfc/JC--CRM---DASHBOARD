"use client"

import { Search, Bell, AlertTriangle, CheckCircle2, Info, DollarSign, PiggyBank, Calendar, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MobileNav } from "./mobile-nav"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { AppNotification } from "@/app/api/notifications/route"

interface HeaderProps {
  title: string
  description: string
  actions?: ReactNode
  user?: { name: string | null; email: string; avatar_url: string | null }
}

const SEVERITY_STYLES = {
  error:   { icon: AlertTriangle,  color: "text-rose-500",   bg: "bg-rose-500/10 border-rose-500/20" },
  warning: { icon: AlertTriangle,  color: "text-amber-500",  bg: "bg-amber-500/10 border-amber-500/20" },
  success: { icon: CheckCircle2,   color: "text-emerald-500",bg: "bg-emerald-500/10 border-emerald-500/20" },
  info:    { icon: Info,           color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/20" },
}

const TYPE_ICONS = {
  budget:      TrendingDown,
  payday:      DollarSign,
  bill:        Calendar,
  transaction: DollarSign,
  goal:        PiggyBank,
}

export function Header({ title, description, actions, user }: HeaderProps) {
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "ME"

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .catch(() => {})
  }, [])

  const unread = notifications.length > 0 && !seen

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen) setSeen(true)
  }

  return (
    <header className="space-y-3 md:space-y-4 animate-slide-in-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <MobileNav />
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks"
              className="pl-9 pr-3 md:pr-16 h-9 text-sm bg-card border-border transition-all duration-300 focus:shadow-lg focus:shadow-primary/10"
            />
            <kbd className="hidden md:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground bg-muted rounded border border-border">
              ⌘F
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative hover:bg-secondary transition-all duration-300 hover:scale-110 h-8 w-8">
                <Bell className="w-4 h-4" />
                {unread && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
                )}
                {notifications.length > 0 && seen && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {notifications.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 shadow-xl" sideOffset={8}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="font-semibold text-sm">Notifications</p>
                {notifications.length > 0 && (
                  <span className="text-xs text-muted-foreground">{notifications.length} alert{notifications.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/40" />
                  <p className="text-sm font-medium text-foreground">All caught up</p>
                  <p className="text-xs text-muted-foreground">No alerts right now. We'll let you know when something needs attention.</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                  {notifications.map((n) => {
                    const { icon: SeverityIcon, color, bg } = SEVERITY_STYLES[n.severity]
                    const TypeIcon = TYPE_ICONS[n.type]
                    return (
                      <div key={n.id} className={`flex gap-3 px-4 py-3 ${bg} border-l-2 m-2 rounded-lg`}>
                        <div className={`mt-0.5 shrink-0 ${color}`}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground leading-tight">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                        </div>
                        <div className={`shrink-0 mt-0.5 ${color}`}>
                          <SeverityIcon className="w-3 h-3" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">
            <Avatar className="w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
              <AvatarImage src={user?.avatar_url ?? "/profile.jpg"} alt={user?.name ?? "User"} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-xs hidden sm:block">
              <p className="font-semibold text-foreground">{user?.name ?? "User"}</p>
              <p className="text-muted-foreground text-[10px]">{user?.email ?? ""}</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground mb-1">{title}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
      </div>

      {actions && <div className="flex flex-col sm:flex-row gap-2">{actions}</div>}
    </header>
  )
}
