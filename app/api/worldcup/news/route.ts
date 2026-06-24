import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
// Brazil men's national team ID on ESPN
const BRAZIL_TEAM_ID = 6167

export const revalidate = 300 // 5-minute cache

interface Article {
  id: string
  headline: string
  description: string
  published: string
  url: string
  imageUrl: string | null
  byline: string | null
  isBrazil: boolean
}

function isBrazilArticle(raw: {
  headline?: string
  description?: string
  categories?: Array<{ type?: string; teamId?: number; team?: { id?: number } }>
}): boolean {
  const text = `${raw.headline ?? ""} ${raw.description ?? ""}`.toLowerCase()
  if (text.includes("brazil")) return true
  return (raw.categories ?? []).some(
    (c) => c.type === "team" && (c.teamId === BRAZIL_TEAM_ID || c.team?.id === BRAZIL_TEAM_ID)
  )
}

export async function GET() {
  try {
    const r = await fetch(`${ESPN_BASE}/news?limit=30`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    })
    if (!r.ok) return NextResponse.json({ articles: [] })

    const data = await r.json()
    const raw: Array<{
      dataSourceIdentifier?: string
      headline?: string
      description?: string
      published?: string
      lastModified?: string
      byline?: string
      links?: { web?: { href?: string } }
      images?: Array<{ url?: string; type?: string }>
      categories?: Array<{ type?: string; teamId?: number; team?: { id?: number } }>
    }> = data.articles ?? []

    const articles: Article[] = raw
      .filter((a) => a.headline && a.links?.web?.href)
      .map((a, i) => ({
        id: a.dataSourceIdentifier ?? String(i),
        headline: a.headline!,
        description: a.description ?? "",
        published: a.published ?? a.lastModified ?? "",
        url: a.links!.web!.href!,
        imageUrl: a.images?.find((img) => img.type === "header")?.url
          ?? a.images?.[0]?.url
          ?? null,
        byline: a.byline ?? null,
        isBrazil: isBrazilArticle(a),
      }))

    // Brazil articles first, then chronological descending
    articles.sort((a, b) => {
      if (a.isBrazil !== b.isBrazil) return a.isBrazil ? -1 : 1
      return new Date(b.published).getTime() - new Date(a.published).getTime()
    })

    return NextResponse.json({ articles })
  } catch (e) {
    console.error("World Cup news error:", e)
    return NextResponse.json({ articles: [] })
  }
}
