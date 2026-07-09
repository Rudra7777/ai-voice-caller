// TEMP one-shot: dispatch a single Arya call, bypassing the web route + Redis
// guardrails (which aren't configured). Mirrors app/api/call/route.ts otherwise.
// Delete after use.
import { dispatchCall, makeDispatchClient } from './lib/livekit'

// libphonenumber's min bundle won't load metadata under tsx, so we skip
// validateCallInput and pass the already-E.164 number the route would produce.
// Override per call via env: CALL_PHONE (E.164) and CALL_NAME.
const value = {
  name: process.env.CALL_NAME || 'there',
  phone: process.env.CALL_PHONE || '+919766696568',
}

async function main() {
  console.log('dialing:', value.phone)
  const r = await dispatchCall(
    { client: makeDispatchClient(), agentName: process.env.LIVEKIT_AGENT_NAME ?? 'arya' },
    value,
  )
  console.log('DISPATCH_RESULT:', JSON.stringify(r))
  process.exit(r.ok ? 0 : 1)
}
void main()
