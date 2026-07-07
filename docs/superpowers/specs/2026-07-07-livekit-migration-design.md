# Design: Migrate Arya from Vapi to LiveKit + Gemini Live (Vertex)

**Date:** 2026-07-07
**Status:** Approved, implementing

## Why

Google changed its API-key format in 2026: new accounts only issue `AQ.`-prefix
"auth keys" bound to service accounts. Vapi's Google BYOK only accepts a legacy
`AIza` Developer-API key and rejects `AQ.` keys, and Rudra's Google account can
only mint `AQ.` keys. Confirmed via live tests: his AI-Studio key authenticates
on the Gemini Developer API but Vapi rejects its format; his Agent-Platform key
is Vertex-only. **No key Rudra can create works with Vapi.**

LiveKit's Google plugin authenticates to Gemini via **Vertex AI service-account
credentials (ADC)**, not an API key — which works with exactly the credentials
Rudra has (`vertex-express` service account) and bills to his $300 GCP credits.

## Decisions

- **Worker language:** all-TypeScript (Node). The Node Agents SDK
  (`@livekit/agents` + `@livekit/agents-plugin-google` v1.2+) supports Gemini
  realtime, Vertex auth, and outbound SIP. Keeps one language and lets the worker
  reuse `config/arya-prompt.ts`, `config/mumbai-spots.ts`, and `lib/sheets.ts`.
- **Hosting:** LiveKit Cloud free tier (media + SIP + 1 agent deployment).
  Frontend stays on Vercel. GCP is used only for Gemini (Vertex) + Sheets.
- **Gemini model:** `gemini-live-2.5-flash-native-audio` — the **Vertex AI** GA
  Live native-audio id (the AI-Studio id `gemini-2.5-flash-native-audio-preview-12-2025`
  is different and does NOT work in Vertex mode). Supports `generateReply()` for
  the agent-speaks-first greeting. GA in `us-central1`. Verified 2026-07-07 that
  project `pure-silicon-501615-i9` reaches Vertex Gemini (200 OK, billing active).
- **Gemini auth:** Vertex via `vertex-express` service account
  (`GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`,
  `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`).

## Architecture / data flow

1. `app/page.tsx` posts `{name, phone, consent}` to `POST /api/call` (unchanged).
2. `/api/call`: `validateCallInput` → `checkGuardrails` (Redis) → **`dispatchCall`**
   creates a new LiveKit room and dispatches the Arya agent with `{name, phone}`
   as job metadata. Returns `{ok, roomName}` or `{ok, error}`.
3. LiveKit Cloud runs the **Arya worker** (`agent/arya.ts`): it reads the metadata,
   starts an `AgentSession` with the Gemini Live realtime model, and calls
   `SipClient.createSipParticipant(trunkId, phone, room)` to dial the caller over
   the Twilio SIP trunk.
4. The worker runs the Hinglish flow. On the `log_lead` tool call it currently
   **logs the lead to the console (stub)** — Google Sheets writing is parked
   (see "Parked / deferred"). The tool stays in the flow so Arya still records
   preferences and wraps up naturally.
5. `maxDuration` ~50–60s; on timeout/end the worker deletes the room to hang up.

The conceptual shift from Vapi: the Next.js app no longer "makes a call" — it
**dispatches our own agent process** into a room, and the agent places the SIP
call. The webhook disappears because the agent already runs our code.

## Components

| Piece | Fate |
|---|---|
| `app/page.tsx`, `lib/validation.ts`, `lib/guardrails.ts` | unchanged |
| `config/arya-prompt.ts`, `config/mumbai-spots.ts` | unchanged, imported by worker |
| `lib/sheets.ts` | unchanged, but **not yet wired into the worker** (Sheets parked) |
| `app/api/call/route.ts` | rewired to call `dispatchCall` |
| `lib/vapi.ts` → `lib/livekit.ts` | replaced; `dispatchCall(deps, args)` keeps the injected-deps pattern |
| `app/api/vapi-webhook/route.ts` | removed |
| `scripts/upsert-assistant.ts` | removed |
| `agent/arya.ts` | new — the LiveKit agent worker |
| `tests/vapi.test.ts` → `tests/livekit.test.ts` | replaced |

## Telephony

Twilio number `+13502371364` (already owned) becomes an **Elastic SIP Trunk**
(termination URI + credentials), registered in LiveKit as an **outbound trunk**
(caller ID = the Twilio number). The worker dials via `LIVEKIT_OUTBOUND_TRUNK_ID`.
The Vapi phone-number import can be released.

TRAI constraint unchanged: outbound-only from the US number to +91 mobiles.

## Env vars

- **Removed:** `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `GEMINI_API_KEY`
- **Added:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `LIVEKIT_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME`, `GOOGLE_GENAI_USE_VERTEXAI`,
  `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`
- **Kept:** `UPSTASH_*`, `DAILY_CALL_CAP`
- **Parked (not needed for a first call):** `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`

## Parked / deferred

- **Google Sheets logging.** `lib/sheets.ts` and its tests stay in the repo
  untouched, but the worker does not import them yet. The `log_lead` tool handler
  logs the lead object to the console for now. Wiring `appendLead` back in is a
  small follow-up: import it in the worker and call it from the `log_lead` handler
  once `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEET_ID` are set. This keeps the
  first live call unblocked by Google service-account setup.

## Error handling

`dispatchCall` returns string error codes like the old `triggerCall`
(`dispatch_failed`), mapped to HTTP status in `route.ts` via `ERROR_STATUS`
(reuse the 502 path). Guardrail/validation error contract is unchanged.

## Testing

- Pure-logic tests unchanged & green: `validation`, `guardrails`, `sheets`.
- New `tests/livekit.test.ts`: `dispatchCall` with a fake dispatch client asserts
  correct room/metadata and error mapping (same injected-deps style as before).
- Worker realtime/SIP behavior verified by a live test call (account-gated), as
  the equivalent Vapi behavior always was.

## Account-gated setup (Rudra)

Create LiveKit Cloud account (URL/key/secret); create Twilio Elastic SIP Trunk +
LiveKit outbound trunk; download `vertex-express` service-account JSON; confirm
the Vertex Live model id + region; deploy worker to LiveKit Cloud; deploy the
(mostly unchanged) Next.js app to Vercel.
