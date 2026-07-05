import { describe, it, expect } from 'vitest'
import { checkGuardrails } from '../lib/guardrails'

function fakeRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    async get(k: string) { return store.get(k) ?? null },
    async incr(k: string) { const n = Number(store.get(k) ?? '0') + 1; store.set(k, String(n)); return n },
    async expire() { return 1 },
    _store: store,
  }
}
const args = { phone: '+919820098200', ip: '1.2.3.4', dailyCap: 20 }

describe('checkGuardrails', () => {
  it('passes when nothing is tripped', async () => {
    const r = await checkGuardrails({ redis: fakeRedis() }, args)
    expect(r).toEqual({ ok: true })
  })
  it('blocks when kill switch is on', async () => {
    const r = await checkGuardrails({ redis: fakeRedis({ killswitch: 'on' }) }, args)
    expect(r).toEqual({ ok: false, error: 'killed' })
  })
  it('blocks a repeat call from the same number', async () => {
    const redis = fakeRedis()
    await redis.incr('num:+919820098200')
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'number_rate_limited' })
  })
  it('blocks once the daily cap is reached', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const redis = fakeRedis({ [`calls:${today}`]: '20' })
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'daily_cap' })
  })
  it('blocks a 4th call from the same IP', async () => {
    const redis = fakeRedis({ 'ip:1.2.3.4': '3' })
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'ip_rate_limited' })
  })
})
