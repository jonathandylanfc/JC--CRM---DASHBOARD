export interface IcsEvent {
  id: string
  title: string
  start: Date
  end: Date | null
  allDay: boolean
  location: string | null
  description: string | null
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } {
  // DATE-only: 20240101
  if (/^\d{8}$/.test(value)) {
    const y = parseInt(value.slice(0, 4))
    const m = parseInt(value.slice(4, 6)) - 1
    const d = parseInt(value.slice(6, 8))
    return { date: new Date(y, m, d), allDay: true }
  }
  // DATE-TIME with Z: 20240101T120000Z
  if (value.endsWith("Z")) {
    return { date: new Date(value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")), allDay: false }
  }
  // DATE-TIME local: 20240101T120000
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    return { date: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`), allDay: false }
  }
  return { date: new Date(value), allDay: false }
}

function unfold(text: string): string {
  // ICS line folding: CRLF + whitespace = continuation
  return text.replace(/\r?\n[ \t]/g, "")
}

function unescape(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
}

function extractValue(line: string): string {
  const colon = line.indexOf(":")
  return colon >= 0 ? unescape(line.slice(colon + 1).trim()) : ""
}

function extractDateValue(line: string): string {
  // DTSTART;VALUE=DATE:20240101 or DTSTART:20240101T120000Z
  const colon = line.indexOf(":")
  return colon >= 0 ? line.slice(colon + 1).trim() : ""
}

export function parseIcs(text: string): IcsEvent[] {
  const unfolded = unfold(text)
  const lines = unfolded.split(/\r?\n/)
  const events: IcsEvent[] = []

  let inEvent = false
  let current: Record<string, string> = {}
  let uid = 0

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true
      current = {}
    } else if (line === "END:VEVENT") {
      inEvent = false
      if (current.DTSTART) {
        const startParsed = parseIcsDate(extractDateValue(":" + current.DTSTART))
        const endRaw = current.DTEND ?? current.DURATION
        let end: Date | null = null
        if (endRaw) {
          try { end = parseIcsDate(extractDateValue(":" + endRaw)).date } catch { end = null }
        }
        events.push({
          id: current.UID ?? String(uid++),
          title: current.SUMMARY ?? "(No title)",
          start: startParsed.date,
          end,
          allDay: startParsed.allDay,
          location: current.LOCATION ?? null,
          description: current.DESCRIPTION ?? null,
        })
      }
    } else if (inEvent) {
      const key = line.split(/[;:]/)[0]
      const baseKey = key.replace(/;.*/, "") // strip params
      const val = extractValue(line)
      if (baseKey === "DTSTART" || baseKey === "DTEND") {
        current[baseKey] = line.replace(/^[^:]+:/, "").trim()
      } else if (!current[baseKey]) {
        current[baseKey] = val
      }
    }
  }

  return events
}

export async function fetchAndParseIcs(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url, { headers: { "User-Agent": "JDpro-Calendar/1.0" }, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return parseIcs(text)
}
