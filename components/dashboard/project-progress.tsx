"use client"

import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"

interface ProjectProgressProps {
  avgProgress: number
  completed: number
  active: number
  total: number
}

export function ProjectProgress({ avgProgress, completed, active, total }: ProjectProgressProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(0)
    if (avgProgress === 0) return
    const step = avgProgress / 40
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= avgProgress) {
          clearInterval(timer)
          return avgProgress
        }
        return Math.min(prev + step, avgProgress)
      })
    }, 30)
    return () => clearInterval(timer)
  }, [avgProgress])

  const circumference = 2 * Math.PI * 70
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <Card
      className="p-4 transition-all duration-500 hover:shadow-xl animate-slide-in-up overflow-hidden"
      style={{ animationDelay: "800ms" }}
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">Goal Progress</h2>
      <div className="flex flex-col items-center">
        <div className="relative w-40 h-40 mb-4">
          <div
            className="absolute inset-0 rounded-full opacity-20"
            style={{
              background:
                "repeating-linear-gradient(45deg, transparent, transparent 6px, oklch(0.42 0.15 155) 6px, oklch(0.42 0.15 155) 12px)",
            }}
          />
          <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted/30" />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-primary transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-foreground">{Math.round(progress)}%</span>
            <span className="text-xs text-muted-foreground mt-1">
              {total === 0 ? "No goals yet" : "Avg progress"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
            <span className="text-muted-foreground">{completed} Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-foreground flex-shrink-0" />
            <span className="text-muted-foreground">{active} Active</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
