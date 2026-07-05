import { describe, it, expect, vi } from 'vitest'
import { buildCallPayload, triggerCall } from '../lib/vapi'

const base = { assistantId: 'asst_1', phoneNumberId: 'pn_1', name: 'Rohan', phone: '+919820098200' }

describe('buildCallPayload', () => {
  it('builds the Vapi call body with customer + variableValues', () => {
    expect(buildCallPayload(base)).toEqual({
      assistantId: 'asst_1',
      phoneNumberId: 'pn_1',
      customer: { number: '+919820098200', name: 'Rohan' },
      assistantOverrides: { variableValues: { name: 'Rohan' } },
    })
  })
})

describe('triggerCall', () => {
  it('posts to Vapi and returns the call id', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'call_123' }),
    }) as unknown as typeof globalThis.fetch
    const r = await triggerCall({ fetch, apiKey: 'k' }, base)
    expect(r).toEqual({ ok: true, callId: 'call_123' })
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.vapi.ai/call')
    expect(init.headers.Authorization).toBe('Bearer k')
  })
  it('returns an error when Vapi responds non-2xx', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'bad' }),
    }) as unknown as typeof globalThis.fetch
    const r = await triggerCall({ fetch, apiKey: 'k' }, base)
    expect(r).toEqual({ ok: false, error: 'vapi_error_400' })
  })
})
