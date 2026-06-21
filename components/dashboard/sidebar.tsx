"use client"

import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  DollarSign,
  PiggyBank,
  Settings,
  BarChart2,
  Trophy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

const BASE_MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: CheckSquare, label: "Tasks", href: "/tasks" },
  { icon: DollarSign, label: "Finance", href: "/finance" },
  { icon: PiggyBank, label: "Budget", href: "/budget" },
  { icon: Calendar, label: "Calendar", href: "/calendar" },
  { icon: BarChart2, label: "Investments", href: "/investments", investmentsOnly: true },
  { icon: Settings, label: "Settings", href: "/settings" },
]

const WORLD_CUP_ITEM = { icon: Trophy, label: "World Cup", href: "/worldcup" }

export function Sidebar({ showInvestments = true }: { showInvestments?: boolean }) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const pathname = usePathname()
  const menuItems = BASE_MENU_ITEMS.filter((i) => !i.investmentsOnly || showInvestments)

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 bg-card border-r border-border p-4 h-screen overflow-y-auto lg:block">
      <div className="flex items-center gap-2 mb-6 group cursor-pointer">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Dylan Pro logo"
            width={48}
            height={48}
            className="rounded-md transition-transform group-hover:scale-110 duration-300"
          />
          <span className="text-lg font-semibold text-foreground">JDpro</span>
        </Link>
      </div>

      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Menu</p>
        <nav className="space-y-0.5">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.label}
                href={item.href}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  hoveredItem === item.label && !isActive && "translate-x-1",
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-sm">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* World Cup section */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">World Cup</p>
        <Link
          href={WORLD_CUP_ITEM.href}
          onMouseEnter={() => setHoveredItem(WORLD_CUP_ITEM.label)}
          onMouseLeave={() => setHoveredItem(null)}
          className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
            pathname === WORLD_CUP_ITEM.href
              ? "bg-yellow-500 text-white shadow-lg shadow-yellow-500/30"
              : "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10",
            hoveredItem === WORLD_CUP_ITEM.label && pathname !== WORLD_CUP_ITEM.href && "translate-x-1",
          )}
        >
          <Trophy className="w-4 h-4" />
          <span className="text-sm">World Cup</span>
          <span className="ml-auto text-[9px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">LIVE</span>
        </Link>
      </div>
    </aside>
  )
}
