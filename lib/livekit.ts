import { randomUUID } from 'node:crypto'

type CallArgs = { name: string; phone: string }

// The agent worker reads this back off ctx.job.metadata.
export function buildDispatchMetadata({ name, phone }: CallArgs): string {
  return JSON.stringify({ name, phone })
}

// Minimal surface we need from livekit-server-sdk's AgentDispatchClient, so
// tests inject a fake and no network runs (mirrors the old vapi.ts pattern).
export type DispatchLike = {
  createDispatch: (
    room: string,
    agentName: string,
    opts: { metadata: string },
  ) => Promise<unknown>
}

type Deps = { client: DispatchLike; agentName: string }
type Result = { ok: true; roomName: string } | { ok: false; error: string }

export async function dispatchCall(deps: Deps, args: CallArgs): Promise<Result> {
  const roomName = `arya-${randomUUID()}`
  try {
    await deps.client.createDispatch(roomName, deps.agentName, {
      metadata: buildDispatchMetadata(args),
    })
    return { ok: true, roomName }
  } catch {
    return { ok: false, error: 'dispatch_failed' }
  }
}

// Real client factory (not exercised in unit tests).
export function makeDispatchClient(): DispatchLike {
  // Imported lazily so the test/build path never needs the native SDK.
  const { AgentDispatchClient } = require('livekit-server-sdk')
  return new AgentDispatchClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  )
}
