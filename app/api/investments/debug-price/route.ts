import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const symbol = req.nextUrl.searchParams.get("symbol") ?? "FLPKX"
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  const result: Record<string, unknown> = { symbol, av_key_set: !!AV_KEY }

  // Alpha Vantage
  if (AV_KEY) {
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) }
      )
      result.av_status = res.status
      result.av_body = await res.json()
    } catch (e) {
      result.av_error = String(e)
    }
  }

  // Yahoo Finance
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}&fields=regularMarketPrice,navPrice,symbol,quoteType`,
      {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    )
    result.yf_status = res.status
    result.yf_body = await res.json()
  } catch (e) {
    result.yf_error = String(e)
  }

  return NextResponse.json(result, { status: 200 })
}
