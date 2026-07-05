# Arya — AI Voice Concierge for Mumbai 🎙️

Arya is an AI voice agent that **calls you on your phone** and chats in natural Hinglish about where to eat and what to do in Mumbai. Drop your number on a web page, and within seconds Arya rings you, asks a few quick preferences, gives you 2 hand-picked recommendations, and logs your taste to a Google Sheet.

Built as a portfolio piece to demonstrate production-style voice-AI agents (lead capture, tool calls, telephony, guardrails) — *"I built this for fun; I can build your business its own version."*

## How a call works

```
Web form ──▶ /api/call ──▶ Vapi ──▶ Twilio (US #) ──▶ your +91 mobile
             (guardrails)    │
                             ▼  speech-to-speech
                        Gemini Live  ──(log_lead tool)──▶ /api/vapi-webhook ──▶ Google Sheet
```

**The conversation** (≤60s hard cap, Arya wraps by ~50s):
greet by name → *which area?* → *veg or non-veg?* → *budget ₹1000 or ₹2000?* → **2 picks** → "noted!" → bye.

## Tech stack

- **[Vapi](https://vapi.ai)** — managed voice orchestration
- **Google Gemini Live** — speech-to-speech brain (chosen for Hinglish code-switching + low latency)
- **Twilio** — outbound telephony to Indian mobiles (Indian DIDs are blocked by TRAI, so we dial *out* from a US number)
- **Next.js 16** (App Router, TypeScript) on **Vercel**
- **Upstash Redis** — rate-limit / daily-cap / kill-switch guardrails
- **Google Sheets** — the leads log
- **Vitest** — unit tests

## Project structure

```
lib/            pure, unit-tested logic
  validation.ts   Indian-mobile + consent validation
  guardrails.ts   kill switch, daily cap, per-number/IP rate limits (Redis-backed)
  vapi.ts         build + send the outbound-call request
  sheets.ts       build a row + append to Google Sheets
app/
  page.tsx        the "enter your number" form
  api/call/          POST: validate → guardrails → trigger call
  api/vapi-webhook/  POST: Arya's log_lead tool → append to Sheet
config/
  mumbai-spots.ts  curated ~20-spot catalog (edit freely — you know Mumbai)
  arya-prompt.ts   Arya's system prompt (embeds the catalog)
scripts/
  upsert-assistant.ts  creates/updates the Arya assistant in Vapi
```

## Setup

### 1. Accounts & credentials

| Service | What you need |
|---|---|
| **Vapi** | API key; import a Twilio number → `phoneNumberId` |
| **Twilio** | a US number (~$1.15/mo) as caller ID; enable India dialing under Geo Permissions |
| **Google Cloud** | project on the $300 free-trial billing account; enable **Generative Language API** (Gemini) + **Google Sheets API**; a Gemini API key (into Vapi) and a **service-account** JSON |
| **Google Sheet** | titled "Arya Leads", header row `Timestamp \| Name \| Phone \| Area \| FoodPref \| Budget \| Recommendations \| CallId`; **share it (Editor) with the service-account email** |
| **Upstash** | a free Redis DB (REST URL + token) |

### 2. Environment

```bash
cp .env.example .env.local   # then fill in real values (never commit .env.local)
```

`.env.local` keys:

```
VAPI_API_KEY=
VAPI_ASSISTANT_ID=            # from step 4
VAPI_PHONE_NUMBER_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=  # the service-account JSON, single line
GOOGLE_SHEET_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DAILY_CALL_CAP=20
```

### 3. Install, test, run

```bash
npm install
npm test          # 18 unit tests
npm run dev       # http://localhost:3000
npm run build     # production build (what Vercel runs)
```

### 4. Deploy & create the assistant

1. Import the repo into **Vercel**, add all env vars, deploy → note the URL.
2. In Vapi → Providers → Google, attach your **Gemini key** (so Gemini bills to your $300-credit project).
3. Confirm the current **Gemini Live model id** in Vapi and set it in `scripts/upsert-assistant.ts` (it ships with a `TODO` placeholder).
4. Create the assistant:
   ```bash
   PUBLIC_BASE_URL=https://<your-app>.vercel.app VAPI_API_KEY=... npx tsx scripts/upsert-assistant.ts
   ```
   Paste the printed `VAPI_ASSISTANT_ID` into Vercel env and redeploy.

### 5. Test safely, then launch

- Twilio **trial** only calls *your own verified* number — perfect for dev. Test-call yourself, confirm a row lands in the Sheet.
- Add **$12** to Twilio (enables non-verified numbers), test 3–4 friends' numbers to confirm deliverability (foreign caller ID can be carrier-flagged), record a demo video as fallback, then share the link.

## Guardrails

Because a public "auto-dial any number" link is risky:

- **Consent** checkbox required (rejected server-side otherwise)
- **1 call per number / 24h**, **3 per IP / 24h**
- **Daily cap** (`DAILY_CALL_CAP`, default 20)
- **60-second** hard call cap (set on the Vapi assistant)
- **Kill switch** — set Redis key `killswitch=on` to instantly disable all calls

## Cost

- **Gemini Live** → covered by **$300 GCP credits** (~$0.05/min ≈ 6,000 min).
- **Vapi + Twilio** → ~**$0.10/min** out of pocket (Vapi $0.05 + Twilio ~$0.0496/min to Indian mobile). **$12 ≈ ~100 one-minute calls.**

## Status

MVP code complete and tested. Remaining work is account setup + deploy (see Setup). The `docs/superpowers/plans/` folder has the full implementation plan.
