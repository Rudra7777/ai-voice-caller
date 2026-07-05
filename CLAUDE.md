# CLAUDE.md — Arya Voice Caller

Project-specific guidance for Claude Code working in this repo. (User's global behavioral guidelines live in `~/CLAUDE.md` and still apply.)

## What this is

"Arya" — an outbound AI voice agent (Vapi + Gemini Live speech-to-speech + Twilio) that calls an Indian mobile and recommends Mumbai food/activities in Hinglish, logging each caller to a Google Sheet. Portfolio project. Full design rationale: `docs/superpowers/plans/2026-07-05-arya-voice-caller.md`.

## Architecture / data flow

1. `app/page.tsx` posts `{ name, phone, consent }` to `POST /api/call`.
2. `app/api/call/route.ts`: `validateCallInput` → `checkGuardrails` (Redis) → `triggerCall` (Vapi outbound). Returns `{ ok, callId }` or `{ ok, error }`.
3. Vapi runs the assistant (created by `scripts/upsert-assistant.ts`) over Twilio to the caller's phone.
4. Mid-call, Arya invokes the `log_lead` tool → Vapi POSTs to `POST /api/vapi-webhook` → `appendLead` writes a row to Google Sheets.

## Commands

```bash
npm test          # Vitest, 18 tests
npm run dev       # local dev server
npm run build     # production build (Vercel target)
npx tsc --noEmit  # typecheck
```

## Conventions (follow these when editing)

- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** `checkGuardrails`, `triggerCall`, `appendLead` all take their external client (`RedisLike`, `fetch`, an `append` fn) as a parameter so tests use fakes/mocks — no network in tests. Keep this pattern; don't call SDKs directly inside pure functions.
- **Error strings are a contract.** `validation.ts` and `guardrails.ts` return string error codes (`invalid_phone`, `consent_required`, `killed`, `daily_cap`, `number_rate_limited`, `ip_rate_limited`). `app/api/call/route.ts` maps these to HTTP status via `ERROR_STATUS`. If you add an error, add its status mapping too.
- **API routes must set `export const runtime = 'nodejs'`** — `googleapis` needs Node, not Edge.
- **Config/content in `config/`.** The recommendation catalog is `mumbai-spots.ts`; the prompt (`arya-prompt.ts`) embeds it. Edit spots there — never let the model invent places.
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values. Never commit real keys.
- Match existing style: small focused files, TypeScript, no unrequested dependencies.

## Gotchas / known constraints

- **Gemini Live model id is a `TODO`** in `scripts/upsert-assistant.ts` (`gemini-2.0-flash-realtime` is a placeholder) — confirm the current id in the Vapi dashboard before running.
- **Phone validation uses a mobile-prefix heuristic (leading digit 6–9)**, not `libphonenumber-js` `getType()` — that library returns `undefined` for Indian number types. See `lib/validation.ts`. If revisiting, this is a TRAI-numbering approximation.
- **Indian phone numbers (+91 DIDs) cannot be owned via Vapi/Twilio (TRAI).** The design dials *outbound* from a US Twilio number. Don't add an inbound-DID flow without an India-compliant provider (e.g. Exotel vSIP).
- **Guardrails are best-effort, not atomic.** `checkGuardrails` does check-then-incr; concurrent requests could momentarily exceed a limit. Fine for a demo; if hardened, use a Redis atomic/Lua primitive.
- **Next.js is 16** (plan text says 15; App Router APIs used are compatible).
- A stray `~/package-lock.json` in the user's home dir confuses Turbopack's local workspace-root detection (harmless warning; Vercel is unaffected).

## Deferred (needs the user's accounts — Claude can't do these)

Account creation, `.env.local` population, Vercel deploy, running `upsert-assistant.ts`, and live call testing. See README "Setup".
