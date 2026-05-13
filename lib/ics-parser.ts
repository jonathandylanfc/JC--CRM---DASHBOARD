export interface IcsEvent {
  id: string
  title: string
  /** ISO string — with Z if UTC, without Z if local (let client interpret in its own timezone) */
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
}

/**
 * Returns an ISO-8601 string.
 * - UTC dates (ends with Z)  → keep as-is with Z  e.g. "2024-05-13T16:30:00Z"
 * - Local dates (no Z/TZID) → return WITHOUT Z    e.g. "2024-05-13T09:30:00"
 *   date-fns parseISO treats no-Z strings as local time, so the browser
 *   correctly shows the event in the user's own timezone.
 * - All-day dates            → return date string  e.g. "2024-05-13"
 */
function parseIcsDateStr(value: string): { str: string; allDay: boolean } {
  // DATE-only: 20240101
  if (/^\d{8}$/.test(value)) {
    const s = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    return { str: s, allDay: true }
  }
  // DATE-TIME UTC: 20240101T120000Z
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const s = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")
    return { str: s, allDay: false }
  }
  // DATE-TIME local (with or without TZID): 20240101T120000
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    // No Z — return as local time string so the browser applies its own offset
    return { str: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`, allDay: false }
  }
  return { str: value, allDay: false }
}

function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "")
}

function unescape(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
}

function extractValue(line: string): string {
  const colon = line.indexOf(":")
  return colon >= 0 ? unescape(line.slice(colon + 1).trim()) : ""
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
        const rawStart = current.DTSTART
        const startParsed = parseIcsDateStr(rawStart)
        const endRaw = current.DTEND ?? null
        let endStr: string | null = null
        if (endRaw) {
          try { endStr = parseIcsDateStr(endRaw).str } catch { endStr = null }
        }
        events.push({
          id: current.UID ?? String(uid++),
          title: current.SUMMARY ? unescape(current.SUMMARY) : "(No title)",
          start: startParsed.str,
          end: endStr,
          allDay: startParsed.allDay,
          location: current.LOCATION ? unescape(current.LOCATION) : null,
          description: current.DESCRIPTION ? unescape(current.DESCRIPTION) : null,
        })
      }
    } else if (inEvent) {
      // Extract base key (strip TZID and other params)
      const colonIdx = line.indexOf(":")
      if (colonIdx < 0) continue
      const keyPart = line.slice(0, colonIdx)
      const baseKey = keyPart.split(";")[0].toUpperCase()
      const val = line.slice(colonIdx + 1).trim()

      if (baseKey === "DTSTART" || baseKey === "DTEND") {
        // Store raw value after colon (e.g. "20240513T093000" or "20240513T163000Z")
        current[baseKey] = val
      } else if (baseKey === "SUMMARY" || baseKey === "LOCATION" || baseKey === "DESCRIPTION" || baseKey === "UID") {
        if (!current[baseKey]) current[baseKey] = val
      }
    }
  }

  return events
}

export async function fetchAndParseIcs(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "JDpro-Calendar/1.0" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return parseIcs(text)
}
