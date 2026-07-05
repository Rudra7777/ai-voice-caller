import { NextRequest, NextResponse } from 'next/server'
import { appendLead, makeSheetsAppender } from '@/lib/sheets'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null)
  const msg = payload?.message
  if (msg?.type !== 'tool-calls') return NextResponse.json({ ok: true })

  const appender = makeSheetsAppender(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, process.env.GOOGLE_SHEET_ID!,
  )
  const results: { toolCallId: string; result: string }[] = []

  for (const tc of msg.toolCallList ?? []) {
    if (tc.function?.name !== 'log_lead') continue
    const a = typeof tc.function.arguments === 'string'
      ? JSON.parse(tc.function.arguments) : tc.function.arguments
    await appendLead(appender, {
      name: msg.call?.customer?.name ?? '',
      phone: msg.call?.customer?.number ?? '',
      area: a.area ?? '', foodPref: a.foodPref ?? '', budget: a.budget ?? '',
      recommendations: Array.isArray(a.recommendations) ? a.recommendations.join('; ') : (a.recommendations ?? ''),
      callId: msg.call?.id ?? '',
    })
    results.push({ toolCallId: tc.id, result: 'logged' })
  }

  return NextResponse.json({ results })
}
