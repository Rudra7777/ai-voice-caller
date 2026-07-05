import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { validateCallInput } from '@/lib/validation'
import { checkGuardrails } from '@/lib/guardrails'
import { triggerCall } from '@/lib/vapi'

export const runtime = 'nodejs'

const ERROR_STATUS: Record<string, number> = {
  invalid_input: 400, invalid_name: 400, invalid_phone: 400, consent_required: 400,
  killed: 503, daily_cap: 429, number_rate_limited: 429, ip_rate_limited: 429,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const v = validateCallInput(body)
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: ERROR_STATUS[v.error] ?? 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const redis = Redis.fromEnv()
  const g = await checkGuardrails({ redis }, {
    phone: v.value.phone, ip, dailyCap: Number(process.env.DAILY_CALL_CAP ?? '20'),
  })
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: ERROR_STATUS[g.error] ?? 429 })

  const r = await triggerCall({ fetch, apiKey: process.env.VAPI_API_KEY! }, {
    assistantId: process.env.VAPI_ASSISTANT_ID!,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
    name: v.value.name,
    phone: v.value.phone,
  })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, callId: r.callId })
}
