# Arya — AI phone order-taker for Gattu's Chinese 🍜

During the dinner rush a restaurant's phone rings while every hand is busy, and
those calls — and the orders on them — are simply lost. **Arya answers instead.**

She picks up, talks to the customer in natural Hinglish, recommends dishes with
a bit of personality ("ye humara bestseller hai", "thoda spicy hai"), takes the
order, reads it back to confirm, and drops it on the kitchen's dashboard.

She is grounded strictly to the restaurant's real menu — she cannot invent a
dish, a size, or a price.

Built as a portfolio piece to demonstrate production-style voice-AI agents
(real-time speech-to-speech, tool calls, telephony) — *"I built this for fun;
I can build your business its own version."*

## How a call works

```
Customer's phone ──▶ Exotel DID ──▶ Exotel vSIP trunk
                                        │
                                        ▼
                          LiveKit inbound trunk + dispatch rule
                                        │
                                        ▼
                     Arya worker (agent/arya.ts, LiveKit Cloud)
                       • Gemini Live (speech-to-speech, via Vertex AI)
                       • grounded to config/menu.ts — no invented dishes
                       • capture_order → priced server-side → Redis
                       • end_call hangs up without clipping her goodbye
                                        │
                                        ▼
                     Kitchen dashboard (/) polls GET /api/orders
```

**The conversation** (5-min hard cap): Arya answers, takes the order, asks
"half ya full?" where a dish has both, asks pickup or delivery (reading a
delivery address back to confirm it), then **reads the whole order back with the
total** and only saves it once the customer says yes. If she genuinely can't
handle the call, she promises a callback and files a `needs_human` record
instead of losing the customer.

## Tech stack

- **[LiveKit](https://livekit.io) Agents (Node)** — real-time media + agent orchestration + inbound SIP
- **Google Gemini Live** — speech-to-speech brain (via **Vertex AI**, chosen for Hinglish code-switching + low latency)
- **Exotel** — India-compliant inbound telephony (an owned Indian DID → LiveKit SIP trunk)
- **Next.js 16** (App Router, TypeScript) on **Vercel** — the kitchen dashboard + `/api/orders`
- **Upstash Redis** — order storage
- **Vitest** — unit tests

> Pivoted from a Mumbai food/activities concierge to a restaurant order-taker on
> 2026-07-15: `docs/superpowers/specs/2026-07-15-restaurant-order-taker-design.md`.
> Migrated from Vapi → LiveKit on 2026-07-07:
> `docs/superpowers/specs/2026-07-07-livekit-migration-design.md`.

## Project structure

```
lib/            pure, unit-tested logic
  menu.ts         menu types + helpers (halfPrice, priceOf, renderMenuForPrompt)
  orders.ts       buildOrder (prices the order server-side) + Redis save/list
app/
  page.tsx        the kitchen dashboard (polls for new orders)
  api/orders/     GET: the saved orders
config/
  menu.ts         the real Gattu's Chinese menu — the ONLY source of dishes/prices
  order-prompt.ts Arya's brain (Hinglish, recommendations, read-back). Tune here.
agent/
  arya.ts         the LiveKit agent worker (Gemini Live + inbound SIP +
                  capture_order / end_call)
```

## Setup

Copy `.env.example` to `.env.local` and fill it in (never commit `.env.local`).
**Nothing rings until Exotel is provisioned** — it's on the critical path.

### 1. Accounts & credentials

| Service | What you need |
|---|---|
| **LiveKit Cloud** | free-tier project → `LIVEKIT_URL`, API key, API secret |
| **Exotel** | an Indian DID + a **vSIP trunk**, pointed at a LiveKit **inbound** SIP trunk; then a LiveKit **dispatch rule** routing that trunk's calls to the agent named `LIVEKIT_AGENT_NAME`. (Indian mobile DIDs can't be owned via a US carrier — TRAI — so Exotel is the compliant path.) |
| **Google Cloud** | project with billing; enable **Vertex AI API**; a **service account** with Vertex access → download its JSON key |
| **Upstash** | a free Redis DB (REST URL + token) — **required**; orders live here |

### 2. Install, test, run

```bash
npm install
npm test          # unit tests (pure logic; no network)
npm run agent:dev # the LiveKit agent worker (needs LiveKit + Vertex + Redis env)
npm run dev       # http://localhost:3000 — the kitchen dashboard
```

Then **call the Exotel number** from a phone. The dashboard and the worker are
two processes: the worker answers calls and writes orders; the Next.js app reads
them back.

### 3. Deploy

1. Import the repo into **Vercel**, add the env vars, deploy (this hosts the dashboard + `/api/orders`).
2. Deploy `agent/arya.ts` as a **LiveKit Cloud agent** with `agentName` = `LIVEKIT_AGENT_NAME` (`arya`) and the same LiveKit + Vertex + Upstash env.

## The menu

`config/menu.ts` is the single source of truth — the real Gattu's Chinese menu
(w.e.f. 20.04.2026). Half plates apply to Noodles, Rice and Side Dishes; their
prices aren't printed on the menu, so they're derived from the restaurant's
convention (`halfPrice` in `lib/menu.ts`: a bit over half the full price, rounded
up to the next ₹10). Edit the menu there and Arya's knowledge changes with it.

Correctness rule: Arya reports *what* was ordered; `buildOrder` decides what it
*costs*, recomputing the total from these prices. The model's arithmetic is never
trusted, and an off-menu dish is rejected before it reaches the kitchen.

## Cost

- **LiveKit Cloud** → free tier covers media + SIP + 1 agent deployment at demo scale.
- **Gemini Live** → billed to Vertex on GCP credits.
- **Exotel** → per-minute inbound + DID rental (see Exotel's India pricing).

## Status

The voice stack (LiveKit + Gemini Live via Vertex) is proven — it placed real
Hinglish calls end-to-end on 2026-07-08 under the previous outbound design.

Remaining: provision **Exotel** (DID + vSIP → LiveKit inbound trunk + dispatch
rule) — nothing rings until this is done; populate **Upstash Redis** (now
required); deploy the worker to LiveKit Cloud and the dashboard to Vercel. The
`docs/superpowers/` folder has the design docs and the implementation plan.
