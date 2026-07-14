# CLAUDE.md — Arya Restaurant Order-Taker

Project-specific guidance for Claude Code working in this repo. (User's global behavioral guidelines live in `~/CLAUDE.md` and still apply.)

## What this is

"Arya" — an **inbound** AI voice agent (LiveKit + Gemini Live speech-to-speech via Vertex AI + Exotel SIP) that answers the phone for **Gattu's Chinese** during the peak rush, takes the customer's order in Hinglish, recommends dishes with personality, and drops the order on a live kitchen dashboard. Portfolio project. Pivoted from a Mumbai food/activities concierge 2026-07-15 (see `docs/superpowers/specs/2026-07-15-restaurant-order-taker-design.md`); migrated off Vapi 2026-07-07 (`docs/superpowers/specs/2026-07-07-livekit-migration-design.md`).

## Architecture / data flow

1. A customer dials the restaurant's **Exotel** number.
2. Exotel's vSIP trunk hands the call to **LiveKit**, whose **inbound dispatch rule** creates a room and dispatches the Arya agent into it. **Nothing dials out — the app never places a call.**
3. The **agent worker** (`agent/arya.ts`) joins, reads the caller's number off the SIP participant attributes (`sip.phoneNumber`), and runs an `AgentSession` with Gemini Live (Vertex). It is grounded strictly to `config/menu.ts`.
4. After the customer confirms Arya's read-back, she invokes `capture_order` → the worker calls `buildOrder` (`lib/orders.ts`), which **validates every dish against the menu and recomputes the total server-side from config prices** (the model's arithmetic is never trusted), then `saveOrder` writes it to Upstash Redis. `end_call` arms a no-clip hangup; a `MAX_CALL_MS` (5 min) hard cap is the safety net.
5. The Next.js app is the **kitchen dashboard**: `app/page.tsx` polls `GET /api/orders` (`app/api/orders/route.ts` → `listOrders`) and renders the order board. `needs_human` orders are highlighted for a callback.

## Commands

```bash
npm test          # Vitest (pure-logic units; no network)
npm run dev       # local Next.js dev server (the kitchen dashboard)
npm run build     # production build (Vercel target)
npx tsc --noEmit  # typecheck
npm run agent:dev # run the LiveKit agent worker locally (auto-loads .env.local via --env-file)
```

## Conventions (follow these when editing)

- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** `buildOrder` is pure; `saveOrder`/`listOrders` take a `RedisLike` so tests use fakes — no network in tests. The real client factory (`makeRedis`) is separate and not unit-tested. Keep this pattern; don't call SDKs directly inside pure functions.
- **The agent must never invent a dish, size or price.** `config/menu.ts` is the only source of truth, and `buildOrder` prices the order server-side. Error strings are a contract: `buildOrder` returns `unknown_item`, `unknown_size`, `invalid_qty`, `address_required`, `empty_order`.
- **API routes must set `export const runtime = 'nodejs'`** — the server SDKs need Node, not Edge.
- **The agent worker (`agent/arya.ts`) is a separate process/deploy** (LiveKit Cloud), not part of the Next.js app. It imports shared TS directly (`config/menu.ts`, `config/order-prompt.ts`, `lib/orders.ts`). Gemini auth is Vertex ADC via env (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`), never an API key.
- **Config/content in `config/`.** `config/menu.ts` is the real Gattu's Chinese menu (the ONLY source of dishes/prices; half prices derive from `halfPrice` in `lib/menu.ts`). `config/order-prompt.ts` is Arya's brain — tune her behaviour there. Note this is the **reverse** of the old concierge design, which deliberately had no catalog.
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values. Never commit real keys.
- Match existing style: small focused files, TypeScript, no unrequested dependencies.

## Gotchas / known constraints

- **Why LiveKit, not Vapi:** Google's 2026 API-key change means Rudra's account only mints `AQ.`-prefix auth keys (service-account-bound), which Vapi's Google BYOK rejects. LiveKit's Google plugin uses Vertex AI service-account auth instead, which works with his keys + $300 GCP credits. Don't propose going back to Vapi unless that key situation changes.
- **Gemini Live model is `gemini-live-2.5-flash-native-audio`** (GA, in `agent/arya.ts`) — the **Vertex AI** id (not the AI-Studio id `gemini-2.5-flash-native-audio-preview-12-2025`), used via service-account auth. Verified **working end-to-end with real calls 2026-07-08** in `us-central1` (a supported Live region; `global` is not). Voice is **`Sulafat`** (Google's "warm" preset; swapped from `Leda`, which sounded robotic — 30 native-audio voices are available). Native-audio supports `generateReply()` for the agent-speaks-first greeting.
- **⚠️ Do NOT swap to `gemini-3.1-flash-live-preview`.** Its id resolves on the Vertex REST publisher-models endpoint (200 OK), so it *looks* available — but the Live bidi WebSocket **rejects it with close code 1008** (proven by a real call 2026-07-08: session dies, phone never usefully connects). It is not actually usable on Vertex Live yet, despite public claims. The only other path to 3.1 Live is an AI-Studio developer key, which this account can't mint (the reason we're on Vertex at all). Lesson: a 200 on the model-metadata endpoint ≠ a working Live session — only a real call proves it.
- **Telephony is Exotel, inbound only.** Indian mobile DIDs cannot be owned via a US Twilio trunk (TRAI), which is why the old outbound Twilio setup is gone. Exotel is India-compliant and supports the owned-DID inbound flow. Exotel provisioning (DID + vSIP trunk → LiveKit inbound trunk + dispatch rule) is **on the critical path**: no call works until it's wired, and there is no local-only shortcut (the old `_dispatch_once.ts` outbound harness is deleted).
- **(Historical, outbound-only)** The old Twilio setup was a trial account (verified caller IDs only), and rapid repeat *outbound* calls to the same Indian mobile got cut at ~45–60s by carrier anti-spam (diagnosed 2026-07-09; drops got shorter with each repeat, recovered after a ~30-min gap). Both problems belonged to the US-Twilio→Indian-carrier leg and do not apply to inbound Exotel calls. (The *other* symptom seen then — intermittent audio cracking / `AudioSource.captureFrame` `InvalidState` — is a media-leg artifact of running the worker locally over WiFi with a cross-continent hop to Gemini `us-central1`; deploying the worker to LiveKit Cloud is what helps there.)
- **Upstash Redis is now required, not optional.** The worker writes orders to it and the dashboard reads them; with `UPSTASH_REDIS_REST_*` blank, `capture_order` throws and `GET /api/orders` returns `orders_unavailable`. Populate it before any end-to-end test.
- **Next.js is 16** (plan text says 15; App Router APIs used are compatible).
- A stray `~/package-lock.json` in the user's home dir confuses Turbopack's local workspace-root detection (harmless warning; Vercel is unaffected).

## Status / deferred

**Done + verified (2026-07-08, on the old outbound setup):** LiveKit Cloud, the Vertex service-account JSON and `.env.local` are set up, and the Gemini Live + LiveKit voice stack placed real end-to-end calls in Hinglish.

**Still outstanding:** provision **Exotel** (DID + vSIP trunk → LiveKit inbound trunk + dispatch rule) — nothing rings until this is done; populate **Upstash Redis** (now required); deploy the worker to LiveKit Cloud (currently run locally); Vercel deploy of the dashboard. See README "Setup".
