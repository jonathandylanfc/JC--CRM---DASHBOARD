import { NextResponse } from "next/server"

export const revalidate = 0 // always fresh

const FLAG = (code: string) =>
  `https://a.espncdn.com/i/teamlogos/countries/500/${code.toLowerCase()}.png`

// FIFA/Coca-Cola World Ranking — exact values from fifa.com (Jun 25 2026)
const STATIC_RANKINGS = [
  { rank: 1,   prevRank: 1,   name: "Argentina",             short: "ARG", flag: FLAG("arg"), confederation: "CONMEBOL", points: 1901.93 },
  { rank: 2,   prevRank: 2,   name: "France",                short: "FRA", flag: FLAG("fra"), confederation: "UEFA",     points: 1894.40 },
  { rank: 3,   prevRank: 3,   name: "Spain",                 short: "ESP", flag: FLAG("esp"), confederation: "UEFA",     points: 1864.32 },
  { rank: 4,   prevRank: 4,   name: "England",               short: "ENG", flag: FLAG("eng"), confederation: "UEFA",     points: 1829.82 },
  { rank: 5,   prevRank: 5,   name: "Brazil",                short: "BRA", flag: FLAG("bra"), confederation: "CONMEBOL", points: 1785.19 },
  { rank: 6,   prevRank: 6,   name: "Morocco",               short: "MAR", flag: FLAG("mar"), confederation: "CAF",      points: 1776.40 },
  { rank: 7,   prevRank: 9,   name: "Portugal",              short: "POR", flag: FLAG("por"), confederation: "UEFA",     points: 1766.74 },
  { rank: 8,   prevRank: 7,   name: "Netherlands",           short: "NED", flag: FLAG("ned"), confederation: "UEFA",     points: 1764.40 },
  { rank: 9,   prevRank: 8,   name: "Germany",               short: "GER", flag: FLAG("ger"), confederation: "UEFA",     points: 1760.46 },
  { rank: 10,  prevRank: 10,  name: "Belgium",               short: "BEL", flag: FLAG("bel"), confederation: "UEFA",     points: 1727.88 },
  { rank: 11,  prevRank: 12,  name: "Colombia",              short: "COL", flag: FLAG("col"), confederation: "CONMEBOL", points: 1727.42 },
  { rank: 12,  prevRank: 15,  name: "Croatia",               short: "CRO", flag: FLAG("cro"), confederation: "UEFA",     points: 1711.48 },
  { rank: 13,  prevRank: 11,  name: "Mexico",                short: "MEX", flag: FLAG("mex"), confederation: "CONCACAF", points: 1711.01 },
  { rank: 14,  prevRank: 13,  name: "USA",                   short: "USA", flag: FLAG("usa"), confederation: "CONCACAF", points: 1709.59 },
  { rank: 15,  prevRank: 14,  name: "Italy",                 short: "ITA", flag: FLAG("ita"), confederation: "UEFA",     points: 1704.73 },
  { rank: 16,  prevRank: 16,  name: "Japan",                 short: "JPN", flag: FLAG("jpn"), confederation: "AFC",      points: 1681.26 },
  { rank: 17,  prevRank: 17,  name: "Switzerland",           short: "SUI", flag: FLAG("sui"), confederation: "UEFA",     points: 1676.00 },
  { rank: 18,  prevRank: 18,  name: "Uruguay",               short: "URU", flag: FLAG("uru"), confederation: "CONMEBOL", points: 1649.96 },
  { rank: 19,  prevRank: 19,  name: "Senegal",               short: "SEN", flag: FLAG("sen"), confederation: "CAF",      points: 1638.36 },
  { rank: 20,  prevRank: 20,  name: "Denmark",               short: "DEN", flag: FLAG("den"), confederation: "UEFA",     points: 1619.47 },
  { rank: 21,  prevRank: 21,  name: "IR Iran",               short: "IRN", flag: FLAG("irn"), confederation: "AFC",      points: 1611.18 },
  { rank: 22,  prevRank: 22,  name: "Norway",                short: "NOR", flag: FLAG("nor"), confederation: "UEFA",     points: 1606.48 },
  { rank: 23,  prevRank: 23,  name: "Austria",               short: "AUT", flag: FLAG("aut"), confederation: "UEFA",     points: 1599.99 },
  { rank: 24,  prevRank: 25,  name: "Nigeria",               short: "NGA", flag: FLAG("nga"), confederation: "CAF",      points: 1585.02 },
  { rank: 25,  prevRank: 26,  name: "Australia",             short: "AUS", flag: FLAG("aus"), confederation: "AFC",      points: 1584.55 },
  { rank: 26,  prevRank: 24,  name: "Korea Republic",        short: "KOR", flag: FLAG("kor"), confederation: "AFC",      points: 1583.72 },
  { rank: 27,  prevRank: 27,  name: "Egypt",                 short: "EGY", flag: FLAG("egy"), confederation: "CAF",      points: 1583.37 },
  { rank: 28,  prevRank: 28,  name: "Algeria",               short: "ALG", flag: FLAG("alg"), confederation: "CAF",      points: 1575.64 },
  { rank: 29,  prevRank: 30,  name: "Ecuador",               short: "ECU", flag: FLAG("ecu"), confederation: "CONMEBOL", points: 1558.35 },
  { rank: 30,  prevRank: 31,  name: "Côte d'Ivoire",         short: "CIV", flag: FLAG("civ"), confederation: "CAF",      points: 1551.71 },
  { rank: 31,  prevRank: 29,  name: "Canada",                short: "CAN", flag: FLAG("can"), confederation: "CONCACAF", points: 1551.07 },
  { rank: 32,  prevRank: 32,  name: "Türkiye",               short: "TUR", flag: FLAG("tur"), confederation: "UEFA",     points: 1550.13 },
  { rank: 33,  prevRank: 33,  name: "Ukraine",               short: "UKR", flag: FLAG("ukr"), confederation: "UEFA",     points: 1549.29 },
  { rank: 34,  prevRank: 34,  name: "Russia",                short: "RUS", flag: FLAG("rus"), confederation: "UEFA",     points: 1529.60 },
  { rank: 35,  prevRank: 35,  name: "Poland",                short: "POL", flag: FLAG("pol"), confederation: "UEFA",     points: 1526.18 },
  { rank: 36,  prevRank: 36,  name: "Sweden",                short: "SWE", flag: FLAG("swe"), confederation: "UEFA",     points: 1517.99 },
  { rank: 37,  prevRank: 37,  name: "Paraguay",              short: "PAR", flag: FLAG("par"), confederation: "CONMEBOL", points: 1517.39 },
  { rank: 38,  prevRank: 38,  name: "Wales",                 short: "WAL", flag: FLAG("wal"), confederation: "UEFA",     points: 1516.95 },
  { rank: 39,  prevRank: 39,  name: "Hungary",               short: "HUN", flag: FLAG("hun"), confederation: "UEFA",     points: 1506.39 },
  { rank: 40,  prevRank: 42,  name: "Serbia",                short: "SRB", flag: FLAG("srb"), confederation: "UEFA",     points: 1502.13 },
  { rank: 41,  prevRank: 44,  name: "Czechia",               short: "CZE", flag: FLAG("cze"), confederation: "UEFA",     points: 1492.26 },
  { rank: 42,  prevRank: 41,  name: "Scotland",              short: "SCO", flag: FLAG("sco"), confederation: "UEFA",     points: 1491.22 },
  { rank: 43,  prevRank: 40,  name: "Panama",                short: "PAN", flag: FLAG("pan"), confederation: "CONCACAF", points: 1489.05 },
  { rank: 44,  prevRank: 45,  name: "Cameroon",              short: "CMR", flag: FLAG("cmr"), confederation: "CAF",      points: 1481.24 },
  { rank: 45,  prevRank: 46,  name: "Slovakia",              short: "SVK", flag: FLAG("svk"), confederation: "UEFA",     points: 1473.66 },
  { rank: 46,  prevRank: 47,  name: "Greece",                short: "GRE", flag: FLAG("gre"), confederation: "UEFA",     points: 1473.19 },
  { rank: 47,  prevRank: 43,  name: "Congo DR",              short: "COD", flag: FLAG("cod"), confederation: "CAF",      points: 1472.37 },
  { rank: 48,  prevRank: 48,  name: "Venezuela",             short: "VEN", flag: FLAG("ven"), confederation: "CONMEBOL", points: 1469.18 },
  { rank: 49,  prevRank: 49,  name: "Chile",                 short: "CHI", flag: FLAG("chi"), confederation: "CONMEBOL", points: 1458.20 },
  { rank: 50,  prevRank: 50,  name: "Peru",                  short: "PER", flag: FLAG("per"), confederation: "CONMEBOL", points: 1457.69 },
  { rank: 51,  prevRank: 51,  name: "Costa Rica",            short: "CRC", flag: FLAG("crc"), confederation: "CONCACAF", points: 1456.03 },
  { rank: 52,  prevRank: 52,  name: "Romania",               short: "ROU", flag: FLAG("rou"), confederation: "UEFA",     points: 1455.89 },
  { rank: 53,  prevRank: 53,  name: "Mali",                  short: "MLI", flag: FLAG("mli"), confederation: "CAF",      points: 1455.59 },
  { rank: 54,  prevRank: 55,  name: "Republic of Ireland",   short: "IRL", flag: FLAG("irl"), confederation: "UEFA",     points: 1441.10 },
  { rank: 55,  prevRank: 56,  name: "Slovenia",              short: "SVN", flag: FLAG("svn"), confederation: "UEFA",     points: 1441.09 },
  { rank: 56,  prevRank: 58,  name: "Tunisia",               short: "TUN", flag: FLAG("tun"), confederation: "CAF",      points: 1437.69 },
  { rank: 57,  prevRank: 54,  name: "Uzbekistan",            short: "UZB", flag: FLAG("uzb"), confederation: "AFC",      points: 1432.84 },
  { rank: 58,  prevRank: 59,  name: "Saudi Arabia",          short: "KSA", flag: FLAG("ksa"), confederation: "AFC",      points: 1426.71 },
  { rank: 59,  prevRank: 61,  name: "South Africa",          short: "RSA", flag: FLAG("rsa"), confederation: "CAF",      points: 1426.24 },
  { rank: 60,  prevRank: 60,  name: "Iraq",                  short: "IRQ", flag: FLAG("irq"), confederation: "AFC",      points: 1419.24 },
  { rank: 61,  prevRank: 57,  name: "Qatar",                 short: "QAT", flag: FLAG("qat"), confederation: "AFC",      points: 1411.06 },
  { rank: 62,  prevRank: 64,  name: "Bosnia and Herzegovina",short: "BIH", flag: FLAG("bih"), confederation: "UEFA",     points: 1408.93 },
  { rank: 63,  prevRank: 62,  name: "Burkina Faso",          short: "BFA", flag: FLAG("bfa"), confederation: "CAF",      points: 1406.99 },
  { rank: 64,  prevRank: 63,  name: "Cabo Verde",            short: "CPV", flag: FLAG("cpv"), confederation: "CAF",      points: 1401.77 },
  { rank: 65,  prevRank: 65,  name: "Ghana",                 short: "GHA", flag: FLAG("gha"), confederation: "CAF",      points: 1398.57 },
  { rank: 66,  prevRank: 66,  name: "Honduras",              short: "HON", flag: FLAG("hon"), confederation: "CONCACAF", points: 1378.97 },
  { rank: 67,  prevRank: 67,  name: "Albania",               short: "ALB", flag: FLAG("alb"), confederation: "UEFA",     points: 1376.03 },
  { rank: 68,  prevRank: 68,  name: "United Arab Emirates",  short: "UAE", flag: FLAG("uae"), confederation: "AFC",      points: 1370.47 },
  { rank: 69,  prevRank: 69,  name: "North Macedonia",       short: "MKD", flag: FLAG("mkd"), confederation: "UEFA",     points: 1369.16 },
  { rank: 70,  prevRank: 70,  name: "Northern Ireland",      short: "NIR", flag: FLAG("nir"), confederation: "UEFA",     points: 1365.30 },
  { rank: 71,  prevRank: 71,  name: "Jamaica",               short: "JAM", flag: FLAG("jam"), confederation: "CONCACAF", points: 1357.84 },
  { rank: 72,  prevRank: 72,  name: "Jordan",                short: "JOR", flag: FLAG("jor"), confederation: "AFC",      points: 1355.89 },
  { rank: 73,  prevRank: 73,  name: "Georgia",               short: "GEO", flag: FLAG("geo"), confederation: "UEFA",     points: 1355.26 },
  { rank: 74,  prevRank: 74,  name: "Iceland",               short: "ISL", flag: FLAG("isl"), confederation: "UEFA",     points: 1342.77 },
  { rank: 75,  prevRank: 75,  name: "Finland",               short: "FIN", flag: FLAG("fin"), confederation: "UEFA",     points: 1341.92 },
  { rank: 76,  prevRank: 76,  name: "Israel",                short: "ISR", flag: FLAG("isr"), confederation: "UEFA",     points: 1333.90 },
  { rank: 77,  prevRank: 77,  name: "Bolivia",               short: "BOL", flag: FLAG("bol"), confederation: "CONMEBOL", points: 1326.00 },
  { rank: 78,  prevRank: 78,  name: "Kosovo",                short: "KOS", flag: FLAG("kos"), confederation: "UEFA",     points: 1319.12 },
  { rank: 79,  prevRank: 79,  name: "Oman",                  short: "OMA", flag: FLAG("oma"), confederation: "AFC",      points: 1306.90 },
  { rank: 80,  prevRank: 80,  name: "Montenegro",            short: "MNE", flag: FLAG("mne"), confederation: "UEFA",     points: 1301.98 },
  { rank: 81,  prevRank: 81,  name: "Curaçao",               short: "CUW", flag: FLAG("cuw"), confederation: "CONCACAF", points: 1299.41 },
  { rank: 82,  prevRank: 82,  name: "Guinea",                short: "GUI", flag: FLAG("gui"), confederation: "CAF",      points: 1295.60 },
  { rank: 83,  prevRank: 83,  name: "Syria",                 short: "SYR", flag: FLAG("syr"), confederation: "AFC",      points: 1283.05 },
  { rank: 84,  prevRank: 84,  name: "New Zealand",           short: "NZL", flag: FLAG("nzl"), confederation: "OFC",      points: 1277.34 },
  { rank: 85,  prevRank: 85,  name: "Gabon",                 short: "GAB", flag: FLAG("gab"), confederation: "CAF",      points: 1272.51 },
  { rank: 86,  prevRank: 86,  name: "Bulgaria",              short: "BUL", flag: FLAG("bul"), confederation: "UEFA",     points: 1271.68 },
  { rank: 87,  prevRank: 88,  name: "Angola",                short: "ANG", flag: FLAG("ang"), confederation: "CAF",      points: 1265.58 },
  { rank: 88,  prevRank: 87,  name: "Haiti",                 short: "HAI", flag: FLAG("hai"), confederation: "CONCACAF", points: 1264.58 },
  { rank: 89,  prevRank: 89,  name: "Uganda",                short: "UGA", flag: FLAG("uga"), confederation: "CAF",      points: 1264.09 },
  { rank: 90,  prevRank: 90,  name: "Zambia",                short: "ZAM", flag: FLAG("zam"), confederation: "CAF",      points: 1255.82 },
  { rank: 91,  prevRank: 91,  name: "China PR",              short: "CHN", flag: FLAG("chn"), confederation: "AFC",      points: 1254.81 },
  { rank: 92,  prevRank: 92,  name: "Bahrain",               short: "BHR", flag: FLAG("bhr"), confederation: "AFC",      points: 1254.41 },
  { rank: 93,  prevRank: 93,  name: "Benin",                 short: "BEN", flag: FLAG("ben"), confederation: "CAF",      points: 1252.17 },
  { rank: 94,  prevRank: 94,  name: "Thailand",              short: "THA", flag: FLAG("tha"), confederation: "AFC",      points: 1250.80 },
  { rank: 95,  prevRank: 95,  name: "Palestine",             short: "PLE", flag: FLAG("ple"), confederation: "AFC",      points: 1243.71 },
  { rank: 96,  prevRank: 96,  name: "Belarus",               short: "BLR", flag: FLAG("blr"), confederation: "UEFA",     points: 1242.88 },
  { rank: 97,  prevRank: 97,  name: "Guatemala",             short: "GUA", flag: FLAG("gua"), confederation: "CONCACAF", points: 1238.74 },
  { rank: 98,  prevRank: 98,  name: "Luxembourg",            short: "LUX", flag: FLAG("lux"), confederation: "UEFA",     points: 1232.82 },
  { rank: 99,  prevRank: 99,  name: "Vietnam",               short: "VIE", flag: FLAG("vie"), confederation: "AFC",      points: 1225.68 },
  { rank: 100, prevRank: 100, name: "El Salvador",           short: "SLV", flag: FLAG("slv"), confederation: "CONCACAF", points: 1225.34 },
]

const CONF_MAP: Record<string, string> = {
  UEFA: "UEFA", CONMEBOL: "CONMEBOL", CAF: "CAF",
  AFC: "AFC", CONCACAF: "CONCACAF", OFC: "OFC",
}

function confName(raw: string): string {
  return CONF_MAP[raw] ?? CONF_MAP[raw?.toUpperCase()] ?? ""
}

const FIFA_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.fifa.com/",
  "Origin": "https://www.fifa.com",
}

// ── Attempt 1: FIFA's own unofficial JSON API ──────────────────────────────────
async function fetchFromFIFA() {
  // Build date-based URLs — FIFA uses dateId=ranking_YYYYMMDD; try today + past 14 days
  const today = new Date()
  const dateIds = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return `ranking_${d.toISOString().slice(0, 10).replace(/-/g, "")}`
  })

  const urls = [
    "https://api.fifa.com/api/v3/ranking/FIFA?language=en&count=100",
    ...dateIds.map((id) => `https://api.fifa.com/api/v3/ranking/FIFA?language=en&dateId=${id}&count=100`),
    "https://api.fifa.com/api/v1/ranking/FIFA?language=en&count=100",
  ]

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: FIFA_HEADERS, cache: "no-store" })
      if (!r.ok) continue
      const data = await r.json()

      // Handle multiple possible response shapes FIFA has used over the years
      type FIFAEntry = Record<string, unknown>
      const entries: FIFAEntry[] =
        (data?.Rankings ?? data?.rankings ?? data?.items ?? data?.data ?? []) as FIFAEntry[]
      if (!entries.length) continue

      const mapped = entries.slice(0, 100).map((e, i) => {
        const rank = Number(e.RankId ?? e.rankId ?? e.rank ?? i + 1)
        const code = String(e.CountryCode ?? e.countryCode ?? e.code ?? "")
        const conf = (e.Confederation as { Name?: string; name?: string } | undefined)
        return {
          rank,
          prevRank: Number(e.PreviousRankId ?? e.previousRankId ?? rank),
          name: String(e.TeamName ?? e.teamName ?? e.name ?? ""),
          short: String(e.ShortClubName ?? e.shortName ?? code),
          flag: FLAG(code.toLowerCase()),
          confederation: confName(conf?.Name ?? conf?.name ?? String(e.confederation ?? "")),
          points: Math.round(Number(e.Points ?? e.points ?? e.totalPoints ?? 0)),
        }
      }).filter((e) => e.name)

      if (mapped.length >= 20) return mapped
    } catch { /* try next url */ }
  }
  throw new Error("All FIFA endpoints failed")
}

// ── Attempt 2: ESPN rankings endpoint (several URL shapes) ────────────────────
async function fetchFromESPN() {
  const urls = [
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/rankings",
    "https://site.api.espn.com/apis/v2/sports/soccer/rankings?league=fifa.world",
    "https://site.web.api.espn.com/apis/v2/sports/soccer/rankings?league=fifa.world",
  ]

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" })
      if (!r.ok) continue
      const data = await r.json()

      type ESPNEntry = {
        current?: number
        rank?: number
        previous?: number
        team?: {
          displayName?: string
          shortDisplayName?: string
          abbreviation?: string
          logos?: Array<{ href: string }>
          flag?: string
        }
        points?: number
        group?: { name?: string; displayName?: string }
      }

      const items: ESPNEntry[] =
        data?.rankings ?? data?.items ?? data?.athletes ?? data?.teams ?? []
      if (!items.length) continue

      const mapped = items.slice(0, 100).map((item, i) => ({
        rank: item.current ?? item.rank ?? i + 1,
        prevRank: item.previous ?? item.current ?? item.rank ?? i + 1,
        name: item.team?.displayName ?? "",
        short: item.team?.shortDisplayName ?? item.team?.abbreviation ?? "",
        flag: item.team?.logos?.[0]?.href ?? item.team?.flag ?? FLAG((item.team?.abbreviation ?? "").toLowerCase()),
        confederation: confName(item.group?.name ?? item.group?.displayName ?? ""),
        points: item.points ?? 0,
      })).filter((e) => e.name)

      if (mapped.length >= 20) return mapped
    } catch { /* try next */ }
  }
  throw new Error("All ESPN ranking endpoints failed")
}

export async function GET() {
  // Try FIFA's API first (most accurate), then ESPN, then static fallback
  try {
    const rankings = await fetchFromFIFA()
    return NextResponse.json({ rankings, source: "live" })
  } catch { /* fall through */ }

  try {
    const rankings = await fetchFromESPN()
    return NextResponse.json({ rankings, source: "live" })
  } catch { /* fall through */ }

  return NextResponse.json({ rankings: STATIC_RANKINGS, source: "pre-tournament" })
}
