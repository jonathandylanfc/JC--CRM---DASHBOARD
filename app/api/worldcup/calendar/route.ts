import { NextResponse } from "next/server"

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"

function toIcsDate(iso: string) {
  // Returns UTC timestamp in iCal format: 20260621T140000Z
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

export async function GET() {
  // Full tournament: June 11 – July 19
  const dates: string[] = []
  for (let d = 11; d <= 30; d++) dates.push(`202606${d}`)
  for (let d = 1; d <= 19; d++) dates.push(`202607${String(d).padStart(2, "0")}`)

  const responses = await Promise.allSettled(
    dates.map((date) =>
      fetch(`${ESPN_BASE}/scoreboard?dates=${date}&limit=20`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }).then((r) => r.json())
    )
  )

  const seen = new Set<string>()
  const vevents: string[] = []

  for (const res of responses) {
    if (res.status !== "fulfilled" || !res.value?.events) continue

    for (const event of res.value.events) {
      if (seen.has(event.id)) continue
      seen.add(event.id)

      const comp = event.competitions?.[0]
      if (!comp) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = comp.competitors?.find((c: any) => c.homeAway === "home") ?? comp.competitors?.[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = comp.competitors?.find((c: any) => c.homeAway === "away") ?? comp.competitors?.[1]
      if (!home || !away) continue

      const startIso = event.date
      const endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString()

      const homeShort = home.team?.shortDisplayName ?? home.team?.abbreviation ?? "?"
      const awayShort = away.team?.shortDisplayName ?? away.team?.abbreviation ?? "?"
      const note = comp.altGameNote ?? ""
      const venue = comp.venue?.fullName ?? ""
      const city = comp.venue?.address?.city ?? ""

      const summary = `${homeShort} vs ${awayShort} · FIFA World Cup`
      const desc = note || "FIFA World Cup 2026"
      const loc = [venue, city].filter(Boolean).join(", ")

      const lines = [
        "BEGIN:VEVENT",
        `UID:wc2026-${event.id}@jdpro`,
        `DTSTART:${toIcsDate(startIso)}`,
        `DTEND:${toIcsDate(endIso)}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(desc)}`,
        ...(loc ? [`LOCATION:${esc(loc)}`] : []),
        "END:VEVENT",
      ]
      vevents.push(lines.join("\r\n"))
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JDpro//FIFA World Cup 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:2026 FIFA World Cup",
    "X-WR-CALDESC:All FIFA World Cup 2026 matches",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n")

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="worldcup2026.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  })
}
