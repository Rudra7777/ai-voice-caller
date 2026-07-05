type CallArgs = { assistantId: string; phoneNumberId: string; name: string; phone: string }

export function buildCallPayload({ assistantId, phoneNumberId, name, phone }: CallArgs) {
  return {
    assistantId,
    phoneNumberId,
    customer: { number: phone, name },
    assistantOverrides: { variableValues: { name } },
  }
}

type Deps = { fetch: typeof globalThis.fetch; apiKey: string }
type Result = { ok: true; callId: string } | { ok: false; error: string }

export async function triggerCall(deps: Deps, args: CallArgs): Promise<Result> {
  const res = await deps.fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCallPayload(args)),
  })
  if (!res.ok) return { ok: false, error: `vapi_error_${res.status}` }
  const data = (await res.json()) as { id: string }
  return { ok: true, callId: data.id }
}
