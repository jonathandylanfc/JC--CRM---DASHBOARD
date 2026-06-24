import { NextRequest, NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

export const revalidate = 0

interface ScoringPlay {
  scorer: string
  minute: string
  team: "home" | "away"
  type: "goal" | "own_goal" | "penalty"
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

    // ESPN summary includes scoringPlays for soccer
    const rawPlays: Array<{
      period?: { number?: number }
      clock?: { displayValue?: string }
      team?: { id?: string }
      athletesInvolved?: Array<{ displayName?: string; shortName?: string }>
      text?: string
      type?: { id?: string; text?: string }
    }> = data.scoringPlays ?? []

    // Resolve home/away team IDs
    const comp = data.header?.competitions?.[0]
    const homeId: string = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "home")?.team?.id ?? ""
    const awayId: string = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "away")?.team?.id ?? ""

    const scoringPlays: ScoringPlay[] = rawPlays
      .filter((p) => {
        // Only include goal-type events (type IDs: 78=goal, 79=penalty goal, 80=own goal in ESPN soccer)
        const typeId = p.type?.id ?? ""
        const typeText = (p.type?.text ?? "").toLowerCase()
        return typeId === "78" || typeId === "79" || typeId === "80" ||
          typeText.includes("goal") || typeText.includes("penalty")
      })
      .map((p) => {
        const athletes = p.athletesInvolved ?? []
        const scorer = athletes[0]?.shortName ?? athletes[0]?.displayName ?? "Unknown"
        const minute = p.clock?.displayValue ?? ""
        const teamId = p.team?.id ?? ""
        const team: "home" | "away" = teamId === homeId ? "home" : teamId === awayId ? "away" : "home"
        const typeId = p.type?.id ?? ""
        const typeText = (p.type?.text ?? "").toLowerCase()
        const type: ScoringPlay["type"] =
          typeId === "80" || typeText.includes("own") ? "own_goal" :
          typeId === "79" || typeText.includes("penalty") ? "penalty" :
          "goal"
        return { scorer, minute, team, type }
      })

    return NextResponse.json({ scoringPlays })
  } catch (e) {
    console.error("Match detail error:", e)
    return NextResponse.json({ scoringPlays: [] })
  }
}
