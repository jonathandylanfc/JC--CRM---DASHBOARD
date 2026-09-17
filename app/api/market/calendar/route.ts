import { NextResponse } from "next/server"

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
}

// Tickers to watch for earnings — Magnificent 7 + MNQ-relevant
const EARNINGS_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "GOOGL", "TSLA", "GOOG"]

// Macro economic events — update these annually when BLS/Fed publish their schedules.
// Dates are official BLS/Fed release dates when known, otherwise approx.
const MACRO_EVENTS: Array<{
  date: string     // YYYY-MM-DD
  label: string
  type: "fomc" | "cpi" | "nfp" | "pce" | "fed_speak"
  note?: string
}> = [
  // ── NFP (1st Friday of following month) ──────────────────────────────────
  { date: "2026-10-02", label: "Jobs Report (NFP)", type: "nfp", note: "Sep 2026 payrolls" },
  { date: "2026-11-06", label: "Jobs Report (NFP)", type: "nfp", note: "Oct 2026 payrolls" },
  { date: "2026-12-04", label: "Jobs Report (NFP)", type: "nfp", note: "Nov 2026 payrolls" },
  { date: "2027-01-09", label: "Jobs Report (NFP)", type: "nfp", note: "Dec 2026 payrolls" },

  // ── CPI (mid-month for prior month, ~10th–15th) ───────────────────────────
  { date: "2026-10-14", label: "CPI Report",        type: "cpi", note: "Sep 2026 CPI" },
  { date: "2026-11-12", label: "CPI Report",        type: "cpi", note: "Oct 2026 CPI" },
  { date: "2026-12-10", label: "CPI Report",        type: "cpi", note: "Nov 2026 CPI" },
  { date: "2027-01-14", label: "CPI Report",        type: "cpi", note: "Dec 2026 CPI" },

  // ── PCE (last week of following month, ~last Fri) ─────────────────────────
  { date: "2026-09-26", label: "PCE Report",        type: "pce", note: "Aug 2026 PCE" },
  { date: "2026-10-30", label: "PCE Report",        type: "pce", note: "Sep 2026 PCE" },
  { date: "2026-11-25", label: "PCE Report",        type: "pce", note: "Oct 2026 PCE" },
  { date: "2026-12-23", label: "PCE Report",        type: "pce", note: "Nov 2026 PCE" },

  // ── FOMC (Fed interest rate decisions) ────────────────────────────────────
  { date: "2026-10-28", label: "FOMC Decision",     type: "fomc", note: "Rate decision + press conference" },
  { date: "2026-12-16", label: "FOMC Decision",     type: "fomc", note: "Rate decision + press conference" },
  { date: "2027-01-27", label: "FOMC Decision",     type: "fomc", note: "Rate decision + press conference" },
  { date: "2027-03-17", label: "FOMC Decision",     type: "fomc", note: "Rate decision + press conference" },
]

export async function GET() {
  // Fetch next earnings date for each key ticker via Yahoo Finance quotes API
  const fields = "symbol,shortName,earningsTimestamp,earningsTimestampStart,earningsTimestampEnd"
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${EARNINGS_TICKERS.join(",")}&fields=${fields}&formatted=false`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${EARNINGS_TICKERS.join(",")}&fields=${fields}&formatted=false`,
  ]

  type EarningsEntry = { symbol: string; name: string | null; date: string | null }
  let earnings: EarningsEntry[] = []

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store", signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const json = await res.json()
      const results: Array<Record<string, unknown>> = json?.quoteResponse?.result ?? []
      if (!results.length) continue

      earnings = results
        .filter((r) => r.earningsTimestamp || r.earningsTimestampStart)
        .map((r) => {
          const ts = (r.earningsTimestamp || r.earningsTimestampStart) as number
          const d = new Date(ts * 1000)
          const dateStr = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
          return {
            symbol: r.symbol as string,
            name: (r.shortName as string | null) ?? null,
            date: dateStr,
          }
        })
        .filter((e) => e.date !== null)
      break
    } catch {
      // try next url
    }
  }

  return NextResponse.json({
    earnings,
    macro: MACRO_EVENTS,
  }, { headers: { "Cache-Control": "no-store" } })
}
