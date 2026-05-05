"use client"

import { Card } from "@/components/ui/card"
import { useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface WeeklyDataPoint {
  day: string
  label: string
  value: number
}

interface ProjectAnalyticsProps {
  weeklyData: WeeklyDataPoint[]
}

const barColors = ["#059669", "#047857", "#10b981", "#065f46", "#059669", "#047857", "#10b981"]

export function ProjectAnalytics({ weeklyData }: ProjectAnalyticsProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const maxValue = Math.max(...weeklyData.map((d) => d.value), 1)
  const total = weeklyData.reduce((acc, d) => acc + d.value, 0)
  const average = Math.round(total / weeklyData.length)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-foreground text-background px-3 py-2 rounded-lg text-xs font-semibold shadow-lg">
          <p className="font-bold">{payload[0].value} min</p>
          <p className="text-[10px] opacity-80">{payload[0].payload.label}</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up bg-gradient-to-br from-background to-muted/20"
      style={{ animationDelay: "400ms" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Focus Activity</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
          <span>Minutes this week</span>
        </div>
      </div>

      <div className="h-64 mb-4 relative">
        {total === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <p className="text-sm">No focus sessions yet this week</p>
            <p className="text-xs">Start a focus session to see your activity</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 14 }}
                className="text-muted-foreground"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
                className="text-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
              <Bar
                dataKey="value"
                fill="url(#barGradient)"
                radius={[12, 12, 12, 12]}
                maxBarSize={60}
                onMouseEnter={(_: any, index: number) => setHoveredBar(index)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {weeklyData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={barColors[index % barColors.length]}
                    style={{
                      filter:
                        hoveredBar === index
                          ? "brightness(1.2) drop-shadow(0 4px 8px rgba(5, 150, 105, 0.4))"
                          : "none",
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="pt-4 border-t border-muted/50 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Daily avg: </span>
          <span className="font-semibold text-foreground">{average} min</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="font-semibold text-emerald-600">{total} min</span>
        </div>
      </div>
    </Card>
  )
}
