# CLAUDE.md — Arya Voice Caller

Project-specific guidance for Claude Code working in this repo. (User's global behavioral guidelines live in `~/CLAUDE.md` and still apply.)

## What this is

"Arya" — an outbound AI voice agent (LiveKit + Gemini Live speech-to-speech via Vertex AI + Twilio SIP) that calls an Indian mobile and recommends Mumbai food/activities in Hinglish. Portfolio project. Migrated off Vapi 2026-07-07 (see `docs/superpowers/specs/2026-07-07-livekit-migration-design.md`); original design rationale: `docs/superpowers/plans/2026-07-05-arya-voice-caller.md`.

## Architecture / data flow

1. `app/page.tsx` posts `{ name, phone, consent }` to `POST /api/call`.
2. `app/api/call/route.ts`: `validateCallInput` → `checkGuardrails` (Redis) → `dispatchCall` (`lib/livekit.ts`) dispatches the Arya agent to a new LiveKit room with `{ name, phone }` as job metadata. Returns `{ ok, roomName }` or `{ ok, error }`.
3. The **agent worker** (`agent/arya.ts`, runs on LiveKit Cloud) picks up the job: starts an `AgentSession` with Gemini Live (Vertex), then `SipClient.createSipParticipant` dials the caller over the Twilio SIP trunk.
4. Mid-call, Arya invokes the `log_lead` tool → handled **in-process** by the worker. Google Sheets is currently parked, so the handler logs the lead to the console (re-wire `appendLead` from `lib/sheets.ts` to restore it).

## Commands

```bash
npm test          # Vitest (pure-logic units; no network)
npm run dev       # local Next.js dev server
npm run build     # production build (Vercel target)
npx tsc --noEmit  # typecheck
npm run agent:dev # run the LiveKit agent worker locally (needs LiveKit + Vertex env)
```

## Conventions (follow these when editing)

- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** `checkGuardrails`, `dispatchCall`, `appendLead` all take their external client (`RedisLike`, a `DispatchLike`, an `append` fn) as a parameter so tests use fakes/mocks — no network in tests. Real client factories (`makeDispatchClient`, `makeSheetsAppender`) are separate and not unit-tested. Keep this pattern; don't call SDKs directly inside pure functions.
- **Error strings are a contract.** `validation.ts` and `guardrails.ts` return string error codes (`invalid_phone`, `consent_required`, `killed`, `daily_cap`, `number_rate_limited`, `ip_rate_limited`); `dispatchCall` returns `dispatch_failed`. `app/api/call/route.ts` maps these to HTTP status (via `ERROR_STATUS`, or an explicit 502 for dispatch failures). If you add an error, add its status mapping too.
- **API routes must set `export const runtime = 'nodejs'`** — the LiveKit server SDK (and `googleapis`) need Node, not Edge.
- **The agent worker (`agent/arya.ts`) is a separate process/deploy** (LiveKit Cloud), not part of the Next.js app. It imports shared TS directly (`config/arya-prompt.ts`, and `lib/sheets.ts` when Sheets is re-enabled). Gemini auth is Vertex ADC via env (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`), never an API key.
- **Config/content in `config/`.** The recommendation catalog is `mumbai-spots.ts`; the prompt (`arya-prompt.ts`) embeds it. Edit spots there — never let the model invent places.
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values. Never commit real keys.
- Match existing style: small focused files, TypeScript, no unrequested dependencies.

## Gotchas / known constraints

- **Why LiveKit, not Vapi:** Google's 2026 API-key change means Rudra's account only mints `AQ.`-prefix auth keys (service-account-bound), which Vapi's Google BYOK rejects. LiveKit's Google plugin uses Vertex AI service-account auth instead, which works with his keys + $300 GCP credits. Don't propose going back to Vapi unless that key situation changes.
- **Gemini Live model is `gemini-live-2.5-flash-native-audio`** (in `agent/arya.ts`) — the **Vertex AI** GA id, NOT the AI-Studio id (`gemini-2.5-flash-native-audio-preview-12-2025`); they differ and only the Vertex one works in Vertex mode. GA in `us-central1` (a supported Live region; `global` is not). Native-audio supports `generateReply()` for the agent-speaks-first greeting. Verified 2026-07-07 that project `pure-silicon-501615-i9` + `us-central1` reaches Vertex Gemini (200 OK, billing active).
- **Phone validation uses a mobile-prefix heuristic (leading digit 6–9)**, not `libphonenumber-js` `getType()` — that library returns `undefined` for Indian number types. See `lib/validation.ts`. If revisiting, this is a TRAI-numbering approximation.
- **Indian phone numbers (+91 DIDs) cannot be owned (TRAI).** The design dials *outbound* from a US Twilio number via a LiveKit SIP trunk. Don't add an inbound-DID flow without an India-compliant provider (e.g. Exotel vSIP).
- **Guardrails are best-effort, not atomic.** `checkGuardrails` does check-then-incr; concurrent requests could momentarily exceed a limit. Fine for a demo; if hardened, use a Redis atomic/Lua primitive.
- **Next.js is 16** (plan text says 15; App Router APIs used are compatible).
- A stray `~/package-lock.json` in the user's home dir confuses Turbopack's local workspace-root detection (harmless warning; Vercel is unaffected).

## Deferred (needs the user's accounts — Claude can't do these)

LiveKit Cloud + Twilio SIP-trunk setup, downloading the `vertex-express` service-account JSON, confirming the Vertex Live model + region, `.env.local` population, deploying the worker to LiveKit Cloud, Vercel deploy, and live call testing. Also parked: re-wiring Google Sheets logging. See README "Setup".
