# CLAUDE.md — Arya Voice Caller

Project-specific guidance for Claude Code working in this repo. (User's global behavioral guidelines live in `~/CLAUDE.md` and still apply.)

## What this is

"Arya" — an outbound AI voice agent (LiveKit + Gemini Live speech-to-speech via Vertex AI + Twilio SIP) that calls an Indian mobile and recommends Mumbai food/activities in Hinglish. Portfolio project. Migrated off Vapi 2026-07-07 (see `docs/superpowers/specs/2026-07-07-livekit-migration-design.md`); original design rationale: `docs/superpowers/plans/2026-07-05-arya-voice-caller.md`.

## Architecture / data flow

1. `app/page.tsx` posts `{ name, phone, consent }` to `POST /api/call`.
2. `app/api/call/route.ts`: `validateCallInput` → `checkGuardrails` (Redis) → `dispatchCall` (`lib/livekit.ts`) dispatches the Arya agent to a new LiveKit room with `{ name, phone }` as job metadata. Returns `{ ok, roomName }` or `{ ok, error }`.
3. The **agent worker** (`agent/arya.ts`, runs on LiveKit Cloud) picks up the job: starts an `AgentSession` with Gemini Live (Vertex), then `SipClient.createSipParticipant` dials the caller over the Twilio SIP trunk.
4. Mid-call, Arya invokes the `log_lead` tool → handled **in-process** by the worker. Google Sheets is currently parked, so the handler logs the lead to the console (re-wire `appendLead` from `lib/sheets.ts` to restore it). When the caller is done, Arya invokes `end_call`, which arms a no-clip hangup; a `MAX_CALL_MS` (2 min) hard cap is the safety net.

## Commands

```bash
npm test          # Vitest (pure-logic units; no network)
npm run dev       # local Next.js dev server
npm run build     # production build (Vercel target)
npx tsc --noEmit  # typecheck
npm run agent:dev # run the LiveKit agent worker locally (auto-loads .env.local via --env-file)
```

## Conventions (follow these when editing)

- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** `checkGuardrails`, `dispatchCall`, `appendLead` all take their external client (`RedisLike`, a `DispatchLike`, an `append` fn) as a parameter so tests use fakes/mocks — no network in tests. Real client factories (`makeDispatchClient`, `makeSheetsAppender`) are separate and not unit-tested. Keep this pattern; don't call SDKs directly inside pure functions.
- **Error strings are a contract.** `validation.ts` and `guardrails.ts` return string error codes (`invalid_phone`, `consent_required`, `killed`, `daily_cap`, `number_rate_limited`, `ip_rate_limited`); `dispatchCall` returns `dispatch_failed`. `app/api/call/route.ts` maps these to HTTP status (via `ERROR_STATUS`, or an explicit 502 for dispatch failures). If you add an error, add its status mapping too.
- **API routes must set `export const runtime = 'nodejs'`** — the LiveKit server SDK (and `googleapis`) need Node, not Edge.
- **The agent worker (`agent/arya.ts`) is a separate process/deploy** (LiveKit Cloud), not part of the Next.js app. It imports shared TS directly (`config/arya-prompt.ts`, and `lib/sheets.ts` when Sheets is re-enabled). Gemini auth is Vertex ADC via env (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`), never an API key.
- **Config/content in `config/`.** Arya is a **pure agent** (as of 2026-07-08): there is no fixed places catalog. The prompt (`arya-prompt.ts`) recommends real Mumbai-metro spots from the model's own knowledge, guarded only by anti-hallucination instructions (favour well-known/landmark places, describe honestly rather than invent, admit when outside the region). Tune Arya's behaviour there. (The old `mumbai-spots.ts` catalog was removed; see `docs/superpowers/` history for prior design.)
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values. Never commit real keys.
- Match existing style: small focused files, TypeScript, no unrequested dependencies.

## Gotchas / known constraints

- **Why LiveKit, not Vapi:** Google's 2026 API-key change means Rudra's account only mints `AQ.`-prefix auth keys (service-account-bound), which Vapi's Google BYOK rejects. LiveKit's Google plugin uses Vertex AI service-account auth instead, which works with his keys + $300 GCP credits. Don't propose going back to Vapi unless that key situation changes.
- **Gemini Live model is `gemini-live-2.5-flash-native-audio`** (GA, in `agent/arya.ts`) — the **Vertex AI** id (not the AI-Studio id `gemini-2.5-flash-native-audio-preview-12-2025`), used via service-account auth. Verified **working end-to-end with real calls 2026-07-08** in `us-central1` (a supported Live region; `global` is not). Voice is **`Sulafat`** (Google's "warm" preset; swapped from `Leda`, which sounded robotic — 30 native-audio voices are available). Native-audio supports `generateReply()` for the agent-speaks-first greeting.
- **⚠️ Do NOT swap to `gemini-3.1-flash-live-preview`.** Its id resolves on the Vertex REST publisher-models endpoint (200 OK), so it *looks* available — but the Live bidi WebSocket **rejects it with close code 1008** (proven by a real call 2026-07-08: session dies, phone never usefully connects). It is not actually usable on Vertex Live yet, despite public claims. The only other path to 3.1 Live is an AI-Studio developer key, which this account can't mint (the reason we're on Vertex at all). Lesson: a 200 on the model-metadata endpoint ≠ a working Live session — only a real call proves it.
- **Phone validation uses a mobile-prefix heuristic (leading digit 6–9)**, not `libphonenumber-js` `getType()` — that library returns `undefined` for Indian number types. See `lib/validation.ts`. If revisiting, this is a TRAI-numbering approximation.
- **Indian phone numbers (+91 DIDs) cannot be owned (TRAI).** The design dials *outbound* from a US Twilio number via a LiveKit SIP trunk. Don't add an inbound-DID flow without an India-compliant provider (e.g. Exotel vSIP).
- **Twilio is a TRIAL account → it only dials *verified caller IDs*.** Confirmed live 2026-07-08: calling an unverified number returns `sip status 400: 32100 Trial accounts can only call verified caller IDs` and the phone never rings — everything upstream (dispatch, worker, Gemini `setupComplete`) succeeds; only the SIP INVITE is blocked. To call arbitrary numbers: verify each in the Twilio console (Phone Numbers → Verified Caller IDs, OTP confirm) or upgrade the account (add billing) to remove the restriction.
- **⚠️ Rapid repeat calls to the same Indian mobile get cut at ~45–60s by carrier anti-spam (diagnosed 2026-07-09).** Calling the same verified number back-to-back many times in a short window makes the call drop mid-conversation with a clean `CLIENT_INITIATED` / `participant_disconnected` (phone-side hangup, `error: null`), and the cutoff gets *shorter* with each repeat. This is the downstream Indian carrier (TRAI anti-spam/fraud filtering) terminating a US-Twilio-origin VoIP call — **not** a worker or audio bug. Proven that day: the first call of a session ran a full 2 min and ended normally via `end_call`; back-to-back repeats dropped shorter each time; after a ~30-min gap, a call completed the full 2 min again. Mitigations: **space calls out** (don't machine-gun one number), upgrade Twilio off trial, and for reliable Indian delivery use an India-compliant provider (Exotel). **Deploying the worker to LiveKit Cloud does NOT fix these drops** — they happen on the Twilio↔carrier↔phone leg, upstream of where the worker runs. (Deploying only helps the *other* symptom: intermittent audio cracking / `AudioSource.captureFrame` `InvalidState` errors, which are media-leg artifacts of running the worker locally over WiFi + the cross-continent hop to Gemini `us-central1`.)
- **Upstash Redis env is currently blank**, so the web `/api/call` route (`Redis.fromEnv()` → `checkGuardrails`) will throw. Local call testing bypasses the web/guardrail layer by calling `dispatchCall` directly (a scratch `_dispatch_once.ts` + `node --env-file=.env.local`; see `run.txt`). Populate `UPSTASH_REDIS_REST_*` before relying on the HTTP route or the guardrails.
- **Guardrails are best-effort, not atomic.** `checkGuardrails` does check-then-incr; concurrent requests could momentarily exceed a limit. Fine for a demo; if hardened, use a Redis atomic/Lua primitive.
- **Next.js is 16** (plan text says 15; App Router APIs used are compatible).
- A stray `~/package-lock.json` in the user's home dir confuses Turbopack's local workspace-root detection (harmless warning; Vercel is unaffected).

## Status / deferred

**Done + verified (2026-07-08):** LiveKit Cloud, the Twilio SIP trunk, the Vertex service-account JSON, and `.env.local` are all set up, and Arya has placed **real end-to-end calls** (worker run locally via `npm run agent:dev`, dialing a verified number, full Hinglish conversation, `log_lead` fired, real places recommended — no hallucination observed).

**Still outstanding:** populate Upstash Redis (guardrails + `/api/call`), deploy the worker to LiveKit Cloud (currently run locally), Vercel deploy of the web app, upgrade Twilio off trial (to reach non-verified numbers), and re-wire Google Sheets logging (parked). See README "Setup".
