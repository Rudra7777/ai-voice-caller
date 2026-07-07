import { describe, it, expect, vi } from 'vitest'
import { buildDispatchMetadata, dispatchCall } from '../lib/livekit'

const args = { name: 'Rohan', phone: '+919820098200' }

describe('buildDispatchMetadata', () => {
  it('serializes name and phone as JSON', () => {
    expect(JSON.parse(buildDispatchMetadata(args))).toEqual(args)
  })
})

describe('dispatchCall', () => {
  it('dispatches the agent with metadata and returns a room name', async () => {
    const createDispatch = vi.fn().mockResolvedValue({ id: 'd_1' })
    const r = await dispatchCall({ client: { createDispatch }, agentName: 'arya' }, args)
    expect(r).toEqual({ ok: true, roomName: expect.stringMatching(/^arya-/) })
    const [room, agentName, opts] = createDispatch.mock.calls[0]
    expect(room).toMatch(/^arya-/)
    expect(agentName).toBe('arya')
    expect(opts).toEqual({ metadata: buildDispatchMetadata(args) })
  })

  it('returns dispatch_failed when the client throws', async () => {
    const createDispatch = vi.fn().mockRejectedValue(new Error('boom'))
    const r = await dispatchCall({ client: { createDispatch }, agentName: 'arya' }, args)
    expect(r).toEqual({ ok: false, error: 'dispatch_failed' })
  })
})
