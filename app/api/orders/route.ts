import { NextResponse } from 'next/server'
import { listOrders, makeRedis } from '@/lib/orders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orders = await listOrders({ redis: makeRedis() })
    return NextResponse.json({ ok: true, orders })
  } catch {
    // Almost always missing UPSTASH_REDIS_REST_* env vars.
    return NextResponse.json({ ok: false, error: 'orders_unavailable' }, { status: 500 })
  }
}
