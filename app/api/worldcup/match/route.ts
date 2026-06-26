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
  scoringPlay?: boolean
  clock?: { value?: number; displayValue?: string }
  team?: { id?: string }
  // ESPN soccer summary uses participants[].athlete
  participants?: Array<{ athlete?: { displayName?: string; shortName?: string }; type?: { text?: string } }>
  // Fallback used by some ESPN leagues
  athletesInvolved?: Array<{ displayName?: string; shortName?: string }>
  penaltyKick?: boolean
  ownGoal?: boolean
  type?: { id?: string; text?: string }
  scoringType?: { displayName?: string; abbreviation?: string }
}

function parseMinute(clock?: { value?: number; displayValue?: string }): string {
  if (!clock) return ""
  // ESPN returns "9'" or "90'+2'" — strip apostrophes so the component can add its own
  if (clock.displayValue) return clock.displayValue.replace(/'/g, "")
  if (clock.value != null) return String(Math.floor(clock.value / 60))
  return ""
}

function isGoalEvent(d: RawDetail): boolean {
  // ESPN soccer summary details use scoringPlay boolean
  if (typeof d.scoringPlay === "boolean") return d.scoringPlay
  // Fallback: type text or id
  const typeText = (d.type?.text ?? d.scoringType?.displayName ?? "").toLowerCase()
  const typeId = d.type?.id ?? ""
  return typeText.includes("goal") || typeId === "score" || typeId === "78" || typeId === "79" || typeId === "80"
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

    const comp = data.header?.competitions?.[0]
    const competitors: Array<{ homeAway: string; team: { id: string } }> = comp?.competitors ?? []
    const homeId = competitors.find((c) => c.homeAway === "home")?.team?.id ?? ""
    const awayId = competitors.find((c) => c.homeAway === "away")?.team?.id ?? ""

    const rawDetails: RawDetail[] = comp?.details ?? data.scoringPlays ?? data.keyPlays ?? []

    const scoringPlays: ScoringPlay[] = rawDetails
      .filter(isGoalEvent)
      .map((d) => {
        // ESPN soccer: scorer is in participants[0].athlete
        // Some other ESPN formats use athletesInvolved
        const athlete =
          d.participants?.[0]?.athlete ??
          (d.athletesInvolved?.[0] as { displayName?: string; shortName?: string } | undefined)
        const scorer = athlete?.shortName ?? athlete?.displayName ?? "Unknown"
        const minute = parseMinute(d.clock)
        const teamId = d.team?.id ?? ""
        const team: "home" | "away" =
          teamId === homeId ? "home" : teamId === awayId ? "away" : "home"

        const scoringTypeName = (d.scoringType?.displayName ?? d.scoringType?.abbreviation ?? "").toLowerCase()
        const type: ScoringPlay["type"] =
          d.ownGoal || scoringTypeName.includes("own") ? "own_goal" :
          d.penaltyKick || scoringTypeName.includes("penalty") || scoringTypeName === "pk" ? "penalty" :
          "goal"

        return { scorer, minute, team, type }
      })

    return NextResponse.json({ scoringPlays })
  } catch (e) {
    console.error("Match detail error:", e)
    return NextResponse.json({ scoringPlays: [] })
  }
}
