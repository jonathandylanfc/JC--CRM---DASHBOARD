"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, CheckSquare, DollarSign, PiggyBank, Settings, BarChart2, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_TABS = [
  { icon: LayoutDashboard, label: "Home", href: "/", investmentsOnly: false },
  { icon: CheckSquare, label: "Tasks", href: "/tasks", investmentsOnly: false },
  { icon: Trophy, label: "WC", href: "/worldcup", investmentsOnly: false, highlight: true },
  { icon: DollarSign, label: "Finance", href: "/finance", investmentsOnly: false },
  { icon: BarChart2, label: "Invest", href: "/investments", investmentsOnly: true },
  { icon: Settings, label: "Settings", href: "/settings", investmentsOnly: false },
]

export function BottomNav({ showInvestments = true }: { showInvestments?: boolean }) {
  const pathname = usePathname()
  const tabs = ALL_TABS.filter((t) => !t.investmentsOnly || showInvestments)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border safe-area-pb">
      <div className="flex items-stretch h-16">
        {tabs.map(({ icon: Icon, label, href, highlight }) => {
          const isActive = pathname === href
          const isWC = !!highlight
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? (isWC ? "text-yellow-500" : "text-primary") : isWC ? "text-yellow-500/70" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-10 h-6 rounded-full transition-all",
                isActive && (isWC ? "bg-yellow-500/20" : "bg-primary/10")
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn("text-[10px] font-medium", isActive ? (isWC ? "text-yellow-500" : "text-primary") : isWC ? "text-yellow-500/70" : "text-muted-foreground")}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
