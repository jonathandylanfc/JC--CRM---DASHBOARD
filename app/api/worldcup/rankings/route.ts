import { NextResponse } from "next/server"

export const revalidate = 3600 // 1 hour

const FLAG = (code: string) =>
  `https://a.espncdn.com/i/teamlogos/countries/500/${code.toLowerCase()}.png`

// Pre-tournament FIFA rankings (March 2026) — shown only if live fetch fails
const STATIC_RANKINGS = [
  { rank: 1,  prevRank: 1,  name: "Argentina",         short: "ARG", flag: FLAG("arg"), confederation: "CONMEBOL", points: 1871 },
  { rank: 2,  prevRank: 2,  name: "France",             short: "FRA", flag: FLAG("fra"), confederation: "UEFA",     points: 1839 },
  { rank: 3,  prevRank: 3,  name: "Spain",              short: "ESP", flag: FLAG("esp"), confederation: "UEFA",     points: 1826 },
  { rank: 4,  prevRank: 4,  name: "England",            short: "ENG", flag: FLAG("eng"), confederation: "UEFA",     points: 1794 },
  { rank: 5,  prevRank: 5,  name: "Brazil",             short: "BRA", flag: FLAG("bra"), confederation: "CONMEBOL", points: 1780 },
  { rank: 6,  prevRank: 6,  name: "Portugal",           short: "POR", flag: FLAG("por"), confederation: "UEFA",     points: 1759 },
  { rank: 7,  prevRank: 7,  name: "Belgium",            short: "BEL", flag: FLAG("bel"), confederation: "UEFA",     points: 1742 },
  { rank: 8,  prevRank: 8,  name: "Netherlands",        short: "NED", flag: FLAG("ned"), confederation: "UEFA",     points: 1741 },
  { rank: 9,  prevRank: 9,  name: "Italy",              short: "ITA", flag: FLAG("ita"), confederation: "UEFA",     points: 1738 },
  { rank: 10, prevRank: 10, name: "Germany",            short: "GER", flag: FLAG("ger"), confederation: "UEFA",     points: 1723 },
  { rank: 11, prevRank: 11, name: "Colombia",           short: "COL", flag: FLAG("col"), confederation: "CONMEBOL", points: 1717 },
  { rank: 12, prevRank: 12, name: "Morocco",            short: "MAR", flag: FLAG("mar"), confederation: "CAF",      points: 1710 },
  { rank: 13, prevRank: 13, name: "Uruguay",            short: "URU", flag: FLAG("uru"), confederation: "CONMEBOL", points: 1707 },
  { rank: 14, prevRank: 14, name: "Croatia",            short: "CRO", flag: FLAG("cro"), confederation: "UEFA",     points: 1705 },
  { rank: 15, prevRank: 15, name: "United States",      short: "USA", flag: FLAG("usa"), confederation: "CONCACAF", points: 1674 },
  { rank: 16, prevRank: 16, name: "Mexico",             short: "MEX", flag: FLAG("mex"), confederation: "CONCACAF", points: 1660 },
  { rank: 17, prevRank: 17, name: "Japan",              short: "JPN", flag: FLAG("jpn"), confederation: "AFC",      points: 1655 },
  { rank: 18, prevRank: 18, name: "Senegal",            short: "SEN", flag: FLAG("sen"), confederation: "CAF",      points: 1651 },
  { rank: 19, prevRank: 19, name: "Ecuador",            short: "ECU", flag: FLAG("ecu"), confederation: "CONMEBOL", points: 1621 },
  { rank: 20, prevRank: 20, name: "Denmark",            short: "DEN", flag: FLAG("den"), confederation: "UEFA",     points: 1617 },
  { rank: 21, prevRank: 21, name: "Switzerland",        short: "SUI", flag: FLAG("sui"), confederation: "UEFA",     points: 1608 },
  { rank: 22, prevRank: 22, name: "Australia",          short: "AUS", flag: FLAG("aus"), confederation: "AFC",      points: 1596 },
  { rank: 23, prevRank: 23, name: "Korea Republic",     short: "KOR", flag: FLAG("kor"), confederation: "AFC",      points: 1590 },
  { rank: 24, prevRank: 24, name: "Austria",            short: "AUT", flag: FLAG("aut"), confederation: "UEFA",     points: 1582 },
  { rank: 25, prevRank: 25, name: "Iran",               short: "IRN", flag: FLAG("irn"), confederation: "AFC",      points: 1575 },
  { rank: 26, prevRank: 26, name: "Türkiye",            short: "TUR", flag: FLAG("tur"), confederation: "UEFA",     points: 1571 },
  { rank: 27, prevRank: 27, name: "Algeria",            short: "ALG", flag: FLAG("alg"), confederation: "CAF",      points: 1568 },
  { rank: 28, prevRank: 28, name: "Hungary",            short: "HUN", flag: FLAG("hun"), confederation: "UEFA",     points: 1561 },
  { rank: 29, prevRank: 29, name: "Norway",             short: "NOR", flag: FLAG("nor"), confederation: "UEFA",     points: 1554 },
  { rank: 30, prevRank: 30, name: "Czech Republic",     short: "CZE", flag: FLAG("cze"), confederation: "UEFA",     points: 1533 },
  { rank: 31, prevRank: 31, name: "Sweden",             short: "SWE", flag: FLAG("swe"), confederation: "UEFA",     points: 1528 },
  { rank: 32, prevRank: 32, name: "Scotland",           short: "SCO", flag: FLAG("sco"), confederation: "UEFA",     points: 1518 },
  { rank: 33, prevRank: 33, name: "Serbia",             short: "SRB", flag: FLAG("srb"), confederation: "UEFA",     points: 1515 },
  { rank: 34, prevRank: 34, name: "Egypt",              short: "EGY", flag: FLAG("egy"), confederation: "CAF",      points: 1507 },
  { rank: 35, prevRank: 35, name: "Canada",             short: "CAN", flag: FLAG("can"), confederation: "CONCACAF", points: 1498 },
  { rank: 36, prevRank: 36, name: "Côte d'Ivoire",      short: "CIV", flag: FLAG("civ"), confederation: "CAF",      points: 1478 },
  { rank: 37, prevRank: 37, name: "Saudi Arabia",       short: "KSA", flag: FLAG("ksa"), confederation: "AFC",      points: 1471 },
  { rank: 38, prevRank: 38, name: "Qatar",              short: "QAT", flag: FLAG("qat"), confederation: "AFC",      points: 1465 },
  { rank: 39, prevRank: 39, name: "Ghana",              short: "GHA", flag: FLAG("gha"), confederation: "CAF",      points: 1458 },
  { rank: 40, prevRank: 40, name: "Tunisia",            short: "TUN", flag: FLAG("tun"), confederation: "CAF",      points: 1452 },
  { rank: 41, prevRank: 41, name: "Bosnia-Herzegovina", short: "BIH", flag: FLAG("bih"), confederation: "UEFA",     points: 1445 },
  { rank: 42, prevRank: 42, name: "New Zealand",        short: "NZL", flag: FLAG("nzl"), confederation: "OFC",      points: 1438 },
  { rank: 43, prevRank: 43, name: "Jordan",             short: "JOR", flag: FLAG("jor"), confederation: "AFC",      points: 1431 },
  { rank: 44, prevRank: 44, name: "Paraguay",           short: "PAR", flag: FLAG("par"), confederation: "CONMEBOL", points: 1424 },
  { rank: 45, prevRank: 45, name: "Uzbekistan",         short: "UZB", flag: FLAG("uzb"), confederation: "AFC",      points: 1418 },
  { rank: 46, prevRank: 46, name: "Cape Verde",         short: "CPV", flag: FLAG("cpv"), confederation: "CAF",      points: 1411 },
  { rank: 47, prevRank: 47, name: "DR Congo",           short: "COD", flag: FLAG("cod"), confederation: "CAF",      points: 1405 },
  { rank: 48, prevRank: 48, name: "Panama",             short: "PAN", flag: FLAG("pan"), confederation: "CONCACAF", points: 1399 },
  { rank: 49, prevRank: 49, name: "Iraq",               short: "IRQ", flag: FLAG("irq"), confederation: "AFC",      points: 1393 },
  { rank: 50, prevRank: 50, name: "Haiti",              short: "HAI", flag: FLAG("hai"), confederation: "CONCACAF", points: 1387 },
]

const CONF_MAP: Record<string, string> = {
  UEFA: "UEFA", CONMEBOL: "CONMEBOL", CAF: "CAF",
  AFC: "AFC", CONCACAF: "CONCACAF", OFC: "OFC",
}

function confFromGroupId(uid: string): string {
  // ESPN group UIDs sometimes encode confederation — fall back to unknown
  return CONF_MAP[uid] ?? ""
}

async function fetchLiveRankings() {
  // Try ESPN's FIFA world rankings endpoint
  const r = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/rankings",
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  )
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()

  type RawRank = {
    current: number
    previous?: number
    team: {
      displayName: string
      shortDisplayName?: string
      abbreviation: string
      logos?: Array<{ href: string }>
      flag?: string
    }
    points?: number
    group?: { name: string }
  }

  const items: RawRank[] = data?.rankings ?? data?.items ?? []
  if (!items.length) throw new Error("Empty rankings response")

  return items.slice(0, 50).map((item, i) => ({
    rank: item.current ?? i + 1,
    prevRank: item.previous ?? item.current ?? i + 1,
    name: item.team.displayName,
    short: item.team.shortDisplayName ?? item.team.abbreviation,
    flag: item.team.logos?.[0]?.href ?? item.team.flag ?? FLAG(item.team.abbreviation.toLowerCase()),
    confederation: confFromGroupId(item.group?.name ?? ""),
    points: item.points ?? 0,
  }))
}

export async function GET() {
  try {
    const rankings = await fetchLiveRankings()
    return NextResponse.json({ rankings, source: "live" })
  } catch {
    // Live fetch failed — return pre-tournament rankings
    return NextResponse.json({ rankings: STATIC_RANKINGS, source: "pre-tournament" })
  }
}
