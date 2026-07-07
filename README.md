# Arya — AI Voice Concierge for Mumbai 🎙️

Arya is an AI voice agent that **calls you on your phone** and chats in natural Hinglish about where to eat and what to do in Mumbai. Drop your number on a web page, and within seconds Arya rings you, asks a few quick preferences, and gives you 2 hand-picked recommendations.

Built as a portfolio piece to demonstrate production-style voice-AI agents (real-time speech-to-speech, tool calls, telephony, guardrails) — *"I built this for fun; I can build your business its own version."*

## How a call works

```
Web form ──▶ /api/call ──▶ dispatch agent to a LiveKit room ({name, phone})
             (guardrails)              │
                                       ▼
                          Arya worker (agent/arya.ts, LiveKit Cloud)
                            • Gemini Live (speech-to-speech, via Vertex AI)
                            • dials you over the Twilio SIP trunk
                            • log_lead tool records your preferences
                                       │
                          Twilio SIP ──▶ your +91 mobile
```

**The conversation** (~60s hard cap, Arya wraps by ~50s):
greet by name → *which area?* → *veg or non-veg?* → *budget ₹1000 or ₹2000?* → **2 picks** → "noted!" → bye.

## Tech stack

- **[LiveKit](https://livekit.io) Agents (Node)** — real-time media + agent orchestration + outbound SIP
- **Google Gemini Live** — speech-to-speech brain (via **Vertex AI**, chosen for Hinglish code-switching + low latency)
- **Twilio** — outbound telephony to Indian mobiles as a LiveKit SIP trunk (Indian DIDs are blocked by TRAI, so we dial *out* from a US number)
- **Next.js 16** (App Router, TypeScript) on **Vercel** — the form + `/api/call`
- **Upstash Redis** — rate-limit / daily-cap / kill-switch guardrails
- **Vitest** — unit tests

> Migrated from Vapi → LiveKit on 2026-07-07. Rationale: `docs/superpowers/specs/2026-07-07-livekit-migration-design.md`.
> **Google Sheets lead-logging is currently parked** — the `log_lead` tool logs to the console; `lib/sheets.ts` stays ready to re-wire.

## Project structure

```
lib/            pure, unit-tested logic
  validation.ts   Indian-mobile + consent validation
  guardrails.ts   kill switch, daily cap, per-number/IP rate limits (Redis-backed)
  livekit.ts      build metadata + dispatch the agent (dispatchCall)
  sheets.ts       build a row + append to Google Sheets (parked — not yet wired)
app/
  page.tsx        the "enter your number" form
  api/call/       POST: validate → guardrails → dispatch agent
config/
  mumbai-spots.ts  curated ~20-spot catalog (edit freely — you know Mumbai)
  arya-prompt.ts   Arya's system prompt (embeds the catalog)
agent/
  arya.ts         the LiveKit agent worker (Gemini Live + SIP + log_lead)
```

## Setup

### 1. Accounts & credentials

| Service | What you need |
|---|---|
| **LiveKit Cloud** | free-tier project → `LIVEKIT_URL`, API key, API secret |
| **Twilio** | a US number (~$1.15/mo) as caller ID; create an **Elastic SIP Trunk**, then register it in LiveKit as an **outbound trunk** → `LIVEKIT_OUTBOUND_TRUNK_ID` |
| **Google Cloud** | project on the $300 free-trial billing; enable **Vertex AI API**; a **service account** (`vertex-express`) with Vertex access → download its JSON key |
| **Upstash** | a free Redis DB (REST URL + token) |

### 2. Environment

```bash
cp .env.example .env.local   # then fill in real values (never commit .env.local)
```

`.env.local` keys: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DAILY_CALL_CAP`.

### 3. Install, test, run

```bash
npm install
npm test          # unit tests (pure logic; no network)
npm run dev       # http://localhost:3000  (the form + /api/call)
npm run agent:dev # the LiveKit agent worker (needs LiveKit + Vertex env)
```

The form and the worker are two processes: the Next.js app dispatches a job; the worker (locally or on LiveKit Cloud) picks it up and places the call.

### 4. Deploy

1. Import the repo into **Vercel**, add the env vars, deploy (this hosts the form + `/api/call`).
2. Deploy `agent/arya.ts` as a **LiveKit Cloud agent** with `agentName` = `LIVEKIT_AGENT_NAME` (`arya`) and the same LiveKit + Vertex env.
3. Confirm the Gemini Live model id + `GOOGLE_CLOUD_LOCATION` region in the Vertex console.

### 5. Test safely, then launch

- Twilio **trial** only calls *your own verified* number — perfect for dev. Test-call yourself, confirm Arya connects and talks.
- Add funds to Twilio (enables non-verified numbers), test 3–4 friends' numbers to confirm deliverability (foreign caller ID can be carrier-flagged), record a demo video as fallback, then share the link.

## Guardrails

Because a public "auto-dial any number" link is risky:

- **Consent** checkbox required (rejected server-side otherwise)
- **1 call per number / 24h**, **3 per IP / 24h**
- **Daily cap** (`DAILY_CALL_CAP`, default 20)
- **~60-second** hard call cap (enforced in the agent worker)
- **Kill switch** — set Redis key `killswitch=on` to instantly disable all calls

## Cost

- **LiveKit Cloud** → free tier covers media + SIP + 1 agent deployment at demo scale.
- **Gemini Live** → billed to Vertex on the **$300 GCP credits**.
- **Twilio** → ~**$0.0496/min** to Indian mobiles (from trial/added credit).

## Status

Code migrated to LiveKit + Gemini (Vertex) and committed. Remaining work is account setup + deploy (see Setup), plus re-wiring Google Sheets logging (parked). The `docs/superpowers/` folder has the design docs.
