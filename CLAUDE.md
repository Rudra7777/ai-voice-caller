# CLAUDE.md — Arya Restaurant Order-Taker

Project-specific guidance for Claude Code working in this repo. (User's global behavioral guidelines live in `~/CLAUDE.md` and still apply.)

## What this is

An **inbound** AI voice agent (LiveKit + Gemini Live speech-to-speech via Vertex AI) that answers the phone for **Gattu's Chinese** during the peak rush, takes the customer's order in Hinglish, recommends dishes with personality, and drops the order on a live kitchen dashboard. Portfolio project. The agent has **no personal name** — it introduces itself as the restaurant ("Hi, this is Gattu's Chinese"); `arya` survives only as the internal LiveKit **agent name** (routing plumbing, never spoken). Pivoted from a Mumbai food/activities concierge 2026-07-15 (see `docs/superpowers/specs/2026-07-15-restaurant-order-taker-design.md`); migrated off Vapi 2026-07-07 (`docs/superpowers/specs/2026-07-07-livekit-migration-design.md`).

## Architecture / data flow

1. A customer dials the restaurant's number. **Demo:** a **LiveKit Phone Number** (first-party US DID, bought in the LiveKit console — no SIP trunk, no KYC). **Real Indian restaurant:** an **Exotel** DID → LiveKit inbound SIP trunk (see `docs/exotel-setup.md`).
2. LiveKit's **inbound dispatch rule** creates a room per caller and dispatches the `arya` agent into it. **Nothing dials out — the app never places a call.**
3. The **agent worker** (`agent/arya.ts`) joins, reads the caller's number off the SIP participant attributes (`sip.phoneNumber`), and runs an `AgentSession` with Gemini Live (Vertex). It is grounded strictly to `config/menu.ts`.
4. After the customer confirms the read-back, the agent invokes `capture_order` → the worker calls `buildOrder` (`lib/orders.ts`), which **validates every dish against the menu and recomputes the total server-side from config prices** (the model's arithmetic is never trusted), then `saveOrder` writes it to Upstash Redis. `end_call` arms a no-clip hangup; a `MAX_CALL_MS` (5 min) hard cap is the safety net.
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
- **Config/content in `config/`.** `config/menu.ts` is the real Gattu's Chinese menu (the ONLY source of dishes/prices; half prices derive from `halfPrice` in `lib/menu.ts` — a bit over half, rounded up to ₹10). Half plates apply to Noodles/Rice/Side Dishes, plus **Chicken Lollypop** as a Starter exception (`HALF_EXCEPTIONS` in `config/menu.ts`). `RESTAURANT.deliveryAreas` is the delivery serviceability list. `config/order-prompt.ts` is the agent's brain — tune behaviour there (Hinglish order-taking, don't re-ask a size the caller already gave, complete-address capture for delivery, decline out-of-zone deliveries and offer pickup, read-back before `capture_order`). Note this is the **reverse** of the old concierge design, which deliberately had no catalog.
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values. Never commit real keys.
- Match existing style: small focused files, TypeScript, no unrequested dependencies.

## Gotchas / known constraints

- **Why LiveKit, not Vapi:** Google's 2026 API-key change means Rudra's account only mints `AQ.`-prefix auth keys (service-account-bound), which Vapi's Google BYOK rejects. LiveKit's Google plugin uses Vertex AI service-account auth instead, which works with his keys + $300 GCP credits. Don't propose going back to Vapi unless that key situation changes.
- **Gemini Live model is `gemini-live-2.5-flash-native-audio`** (GA, in `agent/arya.ts`) — the **Vertex AI** id (not the AI-Studio id `gemini-2.5-flash-native-audio-preview-12-2025`), used via service-account auth. Verified **working end-to-end with real calls 2026-07-08** in `us-central1` (a supported Live region; `global` is not). Voice is **`Puck`** (male, upbeat — suits a busy-but-warm order-taker; swapped from `Sulafat`/female on 2026-07-15). Other male options: `Charon` (calmer/deeper), `Orus` (firm). 30 native-audio voices exist; it's a one-line swap in `agent/arya.ts`. Native-audio supports `generateReply()` for the agent-speaks-first greeting.
- **⚠️ Do NOT swap to `gemini-3.1-flash-live-preview`.** Its id resolves on the Vertex REST publisher-models endpoint (200 OK), so it *looks* available — but the Live bidi WebSocket **rejects it with close code 1008** (proven by a real call 2026-07-08: session dies, phone never usefully connects). It is not actually usable on Vertex Live yet, despite public claims. The only other path to 3.1 Live is an AI-Studio developer key, which this account can't mint (the reason we're on Vertex at all). Lesson: a 200 on the model-metadata endpoint ≠ a working Live session — only a real call proves it.
- **Telephony is inbound only; two provider paths.** **Demo: LiveKit Phone Numbers** — a first-party US DID bought in the LiveKit console (`docs/phone-setup.md`). No SIP trunk, no second vendor, no KYC; the demo number is **+1 484 207 9261** (~$1/mo). **Real Indian restaurant: Exotel** (`docs/exotel-setup.md`) — an owned Indian DID → LiveKit inbound SIP trunk. Indian mobile DIDs can't be owned via a US carrier (TRAI), and *any* provider that gives a real Indian DID (Exotel, Plivo India, …) requires **business KYC** (COI/PAN/GST) — that's regulation, not a vendor quirk, so there's no self-serve Indian-number shortcut.
- **LiveKit cannot place outbound PSTN calls by itself.** LiveKit Phone Numbers is **inbound-only** (outbound + international "coming soon" as of 2026-07). LiveKit is the media/agent layer, not a carrier: any outbound call needs a third-party SIP trunk (Twilio/Telnyx/Plivo) to originate it — which is exactly why the old design used Twilio. Don't propose "just use LiveKit for outbound to India"; it can't, and the US→Indian-carrier leg is also the flaky one (below).
- **(Historical, outbound-only)** The old Twilio trial (verified caller IDs only) saw rapid repeat *outbound* calls to the same Indian mobile cut at ~45–60s by carrier anti-spam (2026-07-09). That belonged to the US-Twilio→Indian-carrier leg and doesn't apply to the current inbound flow.
- **⚠️ Running the worker locally is fragile — deploy it to LiveKit Cloud.** Repeatedly seen 2026-07-15: `npm run agent:dev` on a laptop drops its LiveKit WebSocket whenever WiFi wobbles or the machine sleeps (`getaddrinfo ENOTFOUND …livekit.cloud`, retries 10×, FATAL), and a call can hang right after "Connect callback received" because the audio hops laptop→LiveKit→Gemini `us-central1` over home WiFi. The process staying alive ≠ still registered. **Fix: deploy `agent/arya.ts` to LiveKit Cloud** so it runs next to the media servers, independent of the laptop. (This is the real fix for both the drops and the intermittent `AudioSource.captureFrame InvalidState` audio cracking.)
- **Upstash Redis is required, not optional.** The worker writes orders to it and the dashboard reads them; with `UPSTASH_REDIS_REST_*` blank, `capture_order` throws and `GET /api/orders` returns `orders_unavailable`. Verified working 2026-07-15 (a real call saved an order).
- **Cost model:** LiveKit free tier ~1,000 agent-min/mo + Gemini on GCP credits (~$0.11/call) mean cloud testing is effectively free at demo scale. The real cost is the **caller's ISD charge** dialing the US number from India (~₹8–15/min) — not in any dashboard. Release the LiveKit number to stop the ~$1/mo when idle.
- **Next.js is 16** (plan text says 15; App Router APIs used are compatible).
- A stray `~/package-lock.json` in the user's home dir confuses Turbopack's local workspace-root detection (harmless warning; Vercel is unaffected).

## Status / deferred

**Done + verified end-to-end (2026-07-15):** LiveKit Phone Number (+1 484 207 9261) → dispatch rule → `arya` worker → real inbound Hinglish call → `capture_order` → order saved to Upstash Redis → visible on the dashboard. Server-side pricing, menu grounding, delivery-address capture, and caller-ID-from-SIP all confirmed on a live call. Upstash Redis populated; Vertex service-account + `.env.local` set.

**Still outstanding:** **deploy the worker to LiveKit Cloud** (currently `npm run agent:dev` locally — the top reliability issue; see the ⚠️ gotcha above); **Vercel deploy** of the dashboard; optionally provision **Exotel** for a real Indian DID (needs business KYC — see `docs/exotel-setup.md`). See README "Setup".
