import { NextResponse } from "next/server"

export const revalidate = 3600

export async function GET() {
  // Try FIFA's own ranking page — it embeds data in __NEXT_DATA__
  try {
    const res = await fetch("https://www.fifa.com/en/rankings/men", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    })

    if (res.ok) {
      const html = await res.text()
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
      if (match) {
        const data = JSON.parse(match[1])
        // Navigate through the Next.js page props to find ranking entries
        const pageProps = data?.props?.pageProps ?? {}
        const rankingData =
          pageProps?.rankingData ??
          pageProps?.initialData?.rankingData ??
          pageProps?.data?.rankingData ??
          null

        if (rankingData?.rankings) {
          const rankings = rankingData.rankings.slice(0, 100).map((r: unknown) => {
            const row = r as {
              rankingPosition?: number
              previousRankingPosition?: number
              team?: { name?: string; shortName?: string; abbreviation?: string; flag?: string; confederation?: string }
              points?: number
            }
            return {
              rank: row.rankingPosition ?? 0,
              prevRank: row.previousRankingPosition ?? 0,
              name: row.team?.name ?? "",
              short: row.team?.shortName ?? row.team?.abbreviation ?? "",
              flag: row.team?.flag ?? null,
              confederation: row.team?.confederation ?? "",
              points: row.points ?? 0,
            }
          })
          return NextResponse.json({ rankings, source: "fifa" })
        }
      }
    }
  } catch (e) {
    console.warn("FIFA page scrape failed:", e)
  }

  // Fallback: try ESPN soccer world rankings
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/rankings",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    )
    if (res.ok) {
      const json = await res.json()
      const ranks = (json?.rankings ?? []).slice(0, 100).map((r: unknown, i: number) => {
        const row = r as { team?: { displayName?: string; abbreviation?: string; logo?: string }; points?: number }
        return {
          rank: i + 1,
          prevRank: i + 1,
          name: row.team?.displayName ?? "",
          short: row.team?.abbreviation ?? "",
          flag: row.team?.logo ?? null,
          confederation: "",
          points: row.points ?? 0,
        }
      })
      if (ranks.length > 0) return NextResponse.json({ rankings: ranks, source: "espn" })
    }
  } catch (e) {
    console.warn("ESPN rankings fallback failed:", e)
  }

  return NextResponse.json({ rankings: [], source: "none" })
}
