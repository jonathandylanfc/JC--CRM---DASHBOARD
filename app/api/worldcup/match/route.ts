import { NextRequest, NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 0

interface ScoringPlay {
  scorer: string
  minute: string
  team: "home" | "away"
  type: "goal" | "own_goal" | "penalty"
}

interface RawDetail {
  type?: { id?: string; text?: string }
  clock?: { value?: number; displayValue?: string }
  team?: { id?: string }
  athletesInvolved?: Array<{ displayName?: string; shortName?: string }>
  penaltyKick?: boolean
  ownGoal?: boolean
  text?: string
}

function parseMinute(clock?: { value?: number; displayValue?: string }): string {
  if (!clock) return ""
  // displayValue is "MM:SS" — we only want the minute portion
  if (clock.displayValue) return clock.displayValue.split(":")[0]
  if (clock.value != null) return String(Math.floor(clock.value / 60))
  return ""
}

function isGoalEvent(d: RawDetail): boolean {
  const typeText = (d.type?.text ?? "").toLowerCase()
  const typeId = d.type?.id ?? ""
  return (
    typeText.includes("goal") ||
    // ESPN soccer detail type IDs vary; cover common ones
    typeId === "score" ||
    typeId === "78" || typeId === "79" || typeId === "80"
  )
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  try {
    const r = await fetch(`${ESPN_BASE}/summary?event=${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    })
    if (!r.ok) return NextResponse.json({ scoringPlays: [] })

    const data = await r.json()

    // Resolve home/away team IDs from the header
    const comp = data.header?.competitions?.[0]
    const competitors: Array<{ homeAway: string; team: { id: string } }> =
      comp?.competitors ?? []
    const homeId = competitors.find((c) => c.homeAway === "home")?.team?.id ?? ""
    const awayId = competitors.find((c) => c.homeAway === "away")?.team?.id ?? ""

    // For ESPN soccer, goals are in header.competitions[0].details
    // Fall back to scoringPlays (used by some older leagues) or keyPlays
    const rawDetails: RawDetail[] =
      comp?.details ??
      data.scoringPlays ??
      data.keyPlays ??
      []

    const scoringPlays: ScoringPlay[] = rawDetails
      .filter(isGoalEvent)
      .map((d) => {
        const athletes = d.athletesInvolved ?? []
        const scorer = athletes[0]?.shortName ?? athletes[0]?.displayName ?? "Unknown"
        const minute = parseMinute(d.clock)
        const teamId = d.team?.id ?? ""
        const team: "home" | "away" =
          teamId === homeId ? "home" : teamId === awayId ? "away" : "home"
        const type: ScoringPlay["type"] =
          d.ownGoal ? "own_goal" :
          d.penaltyKick ? "penalty" :
          (d.type?.text ?? "").toLowerCase().includes("own") ? "own_goal" :
          (d.type?.text ?? "").toLowerCase().includes("penalty") ? "penalty" :
          "goal"
        return { scorer, minute, team, type }
      })

    return NextResponse.json({ scoringPlays })
  } catch (e) {
    console.error("Match detail error:", e)
    return NextResponse.json({ scoringPlays: [] })
  }
}
