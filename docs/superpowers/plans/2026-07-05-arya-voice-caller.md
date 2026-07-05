# Arya — Mumbai Voice Concierge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shareable AI voice agent ("Arya") that, when someone submits their Indian mobile number via a web link, calls them and chats in Hinglish about Mumbai food/activity recommendations, logging each caller's preferences to a Google Sheet.

**Architecture:** A Next.js app on Vercel hosts a one-page "enter your number" form and two API routes. `/api/call` validates input, enforces guardrails (consent, rate-limit, daily cap, kill switch), then triggers a Vapi outbound call. Vapi orchestrates the call over a Twilio US number to the Indian mobile, running a Gemini Live speech-to-speech assistant. Mid-call, Arya calls a `log_lead` tool that hits `/api/vapi-webhook`, which appends a row to Google Sheets. Gemini costs draw from $300 GCP credits; Vapi + Twilio come from a ~$12 paid balance.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Vitest, Vapi (managed voice orchestration), Google Gemini Live (speech-to-speech), Twilio (outbound telephony via Vapi), Google Sheets API (`googleapis`), Upstash Redis (`@upstash/ratelimit` for guardrails), `libphonenumber-js` (phone validation), Vercel (hosting).

## Global Constraints

- **Call duration cap: 60 seconds hard** (set on the Vapi assistant as `maxDurationSeconds: 60`). Arya is scripted to wrap by ~50s.
- **Recommendations per call: exactly 2** (not 3) — fits the 60s budget.
- **Daily call cap: 20 calls/day** (env `DAILY_CALL_CAP=20`), enforced in Redis.
- **Per-number rate limit: 1 call per number per 24h.** Per-IP: 3 calls per 24h.
- **Consent required:** the form's consent checkbox must be `true` or the request is rejected.
- **Kill switch:** a Redis flag `killswitch` (string `"on"`) instantly disables all calls without redeploy.
- **Phone numbers accepted: Indian mobiles only**, normalized to E.164 (`+91XXXXXXXXXX`).
- **Currency in copy:** Indian Rupees (₹). Budget tiers offered: **₹1,000** and **₹2,000**.
- **Node runtime** on all API routes (`export const runtime = 'nodejs'`) — `googleapis` needs Node, not Edge.
- **Secrets** live only in Vercel env vars / `.env.local` (gitignored). Never commit keys.

---

## File Structure

```
ai-voice-caller/                      (existing repo)
├─ app/
│  ├─ page.tsx                        # "enter your number" form UI
│  ├─ layout.tsx                      # root layout
│  ├─ globals.css                     # minimal styles
│  └─ api/
│     ├─ call/route.ts                # POST: validate → guardrails → trigger Vapi call
│     └─ vapi-webhook/route.ts        # POST: Arya's log_lead tool → append to Sheet
├─ lib/
│  ├─ validation.ts                   # phone + name + consent validation (pure)
│  ├─ guardrails.ts                   # Redis: rate-limit, daily cap, kill switch
│  ├─ vapi.ts                         # build + send outbound-call request
│  └─ sheets.ts                       # build row + append to Google Sheet
├─ scripts/
│  └─ upsert-assistant.ts             # create/update the "Arya" Vapi assistant
├─ config/
│  ├─ arya-prompt.ts                  # Arya system prompt (imports mumbai-spots)
│  └─ mumbai-spots.ts                 # curated ~20-spot list (user-editable)
├─ tests/
│  ├─ validation.test.ts
│  ├─ guardrails.test.ts
│  ├─ vapi.test.ts
│  └─ sheets.test.ts
├─ .env.local                         # secrets (gitignored)
├─ .env.example                       # documented placeholders (committed)
├─ vitest.config.ts
└─ package.json
```

Files that change together live together: pure logic in `lib/` (unit-tested), config/content in `config/`, HTTP glue in `app/api/`.

---

## Task 0: Accounts & external setup (manual — no code)

This task produces the credentials every later task consumes. Do it first; nothing runs without it.

- [ ] **Vapi:** Create account at vapi.ai. Copy the **API key** (Dashboard → API Keys) → this is `VAPI_API_KEY`.
- [ ] **Twilio:** Create account. Buy one **US local number** (~$1.15/mo) for caller ID. Under Voice → Geographic Permissions, **enable dialing to India**. Note Account SID + Auth Token.
- [ ] **Import Twilio number into Vapi:** Vapi Dashboard → Phone Numbers → Import from Twilio (paste SID/token/number). Copy the resulting **`phoneNumberId`** → `VAPI_PHONE_NUMBER_ID`.
- [ ] **Verify the India rate on YOUR account:** Twilio Console → Voice → Pricing → India. Confirm outbound-to-mobile ≈ **$0.0496/min**. (This gates how far $12 stretches.)
- [ ] **Google Cloud (for Gemini + Sheets, billed to $300 credits):**
  - Create/choose a GCP project with the **$300 free-trial billing account** attached.
  - Enable **Generative Language API** (Gemini) and **Google Sheets API**.
  - Create an **API key** for Gemini → `GEMINI_API_KEY` (goes into Vapi, not this app). Confirm the key's project is the one holding the $300 credits.
  - Create a **service account**, download its JSON key → `GOOGLE_SERVICE_ACCOUNT_JSON` (single-line, base64 or raw JSON).
- [ ] **Google Sheet:** Create a sheet titled "Arya Leads". Add header row: `Timestamp | Name | Phone | Area | FoodPref | Budget | Recommendations | CallId`. Copy the **spreadsheet ID** from its URL → `GOOGLE_SHEET_ID`. **Share the sheet (Editor) with the service account's email.**
- [ ] **Upstash:** Create a free Redis database at upstash.com. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- [ ] **Trial-testing note:** Twilio trial can only call *your own verified* number. Verify your personal mobile now (Console → Verified Caller IDs) for dev testing before spending the paid $12.

**Verify:** You have all values below. Create `.env.local` (and mirror keys with blank values in `.env.example`):

```bash
VAPI_API_KEY=
VAPI_ASSISTANT_ID=            # filled in Task 9
VAPI_PHONE_NUMBER_ID=
GEMINI_API_KEY=              # used by scripts/upsert-assistant.ts payload only
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_SHEET_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DAILY_CALL_CAP=20
```

---

## Task 1: Scaffold Next.js + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a runnable Next.js app and a working `npm test` command.

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/rudrapatole/Desktop/ai-voice-caller
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --eslint --use-npm --no-import-alias
```
(If it refuses because the dir isn't empty due to `README.md`/`docs/`, accept overwrite prompts for config files only; keep `README.md` and `docs/`.)

- [ ] **Step 2: Add test + runtime deps**

```bash
npm install libphonenumber-js googleapis @upstash/ratelimit @upstash/redis
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write a smoke test**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Ensure `.env.local` is gitignored**

Confirm `.gitignore` contains `.env*.local`. Commit `.env.example` (blank values), never `.env.local`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

## Task 2: Input validation module

**Files:**
- Create: `lib/validation.ts`
- Test: `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `type CallInput = { name: string; phone: string; consent: boolean }`
  - `type ValidationResult = { ok: true; value: { name: string; phone: string } } | { ok: false; error: string }`
  - `validateCallInput(raw: unknown): ValidationResult` — trims name (2–40 chars), normalizes phone to E.164 Indian mobile via `libphonenumber-js`, requires `consent === true`.

- [ ] **Step 1: Write the failing tests**

Create `tests/validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateCallInput } from '../lib/validation'

describe('validateCallInput', () => {
  it('accepts a valid Indian mobile and normalizes to E.164', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '9820098200', consent: true })
    expect(r).toEqual({ ok: true, value: { name: 'Rohan', phone: '+919820098200' } })
  })
  it('accepts a +91-prefixed number', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '+91 98200 98200', consent: true })
    expect(r.ok && r.value.phone).toBe('+919820098200')
  })
  it('rejects missing consent', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '9820098200', consent: false })
    expect(r).toEqual({ ok: false, error: 'consent_required' })
  })
  it('rejects a non-Indian number', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '+14155552671', consent: true })
    expect(r).toEqual({ ok: false, error: 'invalid_phone' })
  })
  it('rejects a too-short name', () => {
    const r = validateCallInput({ name: 'R', phone: '9820098200', consent: true })
    expect(r).toEqual({ ok: false, error: 'invalid_name' })
  })
  it('rejects garbage input', () => {
    const r = validateCallInput(null)
    expect(r).toEqual({ ok: false, error: 'invalid_input' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/validation.test.ts`
Expected: FAIL — cannot find module `../lib/validation`.

- [ ] **Step 3: Implement**

Create `lib/validation.ts`:
```ts
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export type CallInput = { name: string; phone: string; consent: boolean }
export type ValidationResult =
  | { ok: true; value: { name: string; phone: string } }
  | { ok: false; error: string }

export function validateCallInput(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalid_input' }
  const { name, phone, consent } = raw as Record<string, unknown>

  if (consent !== true) return { ok: false, error: 'consent_required' }

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 40)
    return { ok: false, error: 'invalid_name' }

  if (typeof phone !== 'string') return { ok: false, error: 'invalid_phone' }
  const parsed = parsePhoneNumberFromString(phone, 'IN')
  if (!parsed || !parsed.isValid() || parsed.country !== 'IN' || parsed.getType() !== 'MOBILE')
    return { ok: false, error: 'invalid_phone' }

  return { ok: true, value: { name: name.trim(), phone: parsed.number } }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/validation.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts tests/validation.test.ts
git commit -m "feat: add call-input validation for Indian mobiles"
```

---

## Task 3: Guardrails module (rate-limit, daily cap, kill switch)

**Files:**
- Create: `lib/guardrails.ts`
- Test: `tests/guardrails.test.ts`

**Interfaces:**
- Consumes: `@upstash/redis`, `@upstash/ratelimit`.
- Produces: `checkGuardrails(deps, args): Promise<{ ok: true } | { ok: false; error: string }>` where
  - `deps = { redis: RedisLike }`, `RedisLike = { get(k): Promise<string|null>; incr(k): Promise<number>; expire(k, s): Promise<unknown> }`
  - `args = { phone: string; ip: string; dailyCap: number }`
  - Order of checks: kill switch → daily cap → per-number → per-IP. Errors: `killed`, `daily_cap`, `number_rate_limited`, `ip_rate_limited`.

Rationale: inject a minimal `RedisLike` so logic is unit-testable with a fake, no network in tests.

- [ ] **Step 1: Write the failing tests**

Create `tests/guardrails.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { checkGuardrails } from '../lib/guardrails'

function fakeRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    async get(k: string) { return store.get(k) ?? null },
    async incr(k: string) { const n = Number(store.get(k) ?? '0') + 1; store.set(k, String(n)); return n },
    async expire() { return 1 },
    _store: store,
  }
}
const args = { phone: '+919820098200', ip: '1.2.3.4', dailyCap: 20 }

describe('checkGuardrails', () => {
  it('passes when nothing is tripped', async () => {
    const r = await checkGuardrails({ redis: fakeRedis() }, args)
    expect(r).toEqual({ ok: true })
  })
  it('blocks when kill switch is on', async () => {
    const r = await checkGuardrails({ redis: fakeRedis({ killswitch: 'on' }) }, args)
    expect(r).toEqual({ ok: false, error: 'killed' })
  })
  it('blocks a repeat call from the same number', async () => {
    const redis = fakeRedis()
    await redis.incr('num:+919820098200')
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'number_rate_limited' })
  })
  it('blocks once the daily cap is reached', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const redis = fakeRedis({ [`calls:${today}`]: '20' })
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'daily_cap' })
  })
  it('blocks a 4th call from the same IP', async () => {
    const redis = fakeRedis({ 'ip:1.2.3.4': '3' })
    const r = await checkGuardrails({ redis }, args)
    expect(r).toEqual({ ok: false, error: 'ip_rate_limited' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/guardrails.test.ts`
Expected: FAIL — cannot find module `../lib/guardrails`.

- [ ] **Step 3: Implement**

Create `lib/guardrails.ts`:
```ts
export type RedisLike = {
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}
type Deps = { redis: RedisLike }
type Args = { phone: string; ip: string; dailyCap: number }
type Result = { ok: true } | { ok: false; error: string }

const DAY = 60 * 60 * 24

export async function checkGuardrails({ redis }: Deps, { phone, ip, dailyCap }: Args): Promise<Result> {
  if ((await redis.get('killswitch')) === 'on') return { ok: false, error: 'killed' }

  const today = new Date().toISOString().slice(0, 10)
  const dailyKey = `calls:${today}`
  const dailyCount = Number((await redis.get(dailyKey)) ?? '0')
  if (dailyCount >= dailyCap) return { ok: false, error: 'daily_cap' }

  if (Number((await redis.get(`num:${phone}`)) ?? '0') >= 1)
    return { ok: false, error: 'number_rate_limited' }

  if (Number((await redis.get(`ip:${ip}`)) ?? '0') >= 3)
    return { ok: false, error: 'ip_rate_limited' }

  // All checks passed — record this call.
  const newDaily = await redis.incr(dailyKey)
  if (newDaily === 1) await redis.expire(dailyKey, DAY)
  await redis.incr(`num:${phone}`); await redis.expire(`num:${phone}`, DAY)
  await redis.incr(`ip:${ip}`); await redis.expire(`ip:${ip}`, DAY)
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/guardrails.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/guardrails.ts tests/guardrails.test.ts
git commit -m "feat: add Redis-backed guardrails (kill switch, caps, rate limits)"
```

---

## Task 4: Vapi outbound-call client

**Files:**
- Create: `lib/vapi.ts`
- Test: `tests/vapi.test.ts`

**Interfaces:**
- Produces:
  - `buildCallPayload(args): object` — pure builder. `args = { assistantId, phoneNumberId, name, phone }`. Returns `{ assistantId, phoneNumberId, customer: { number, name }, assistantOverrides: { variableValues: { name } } }`.
  - `triggerCall(deps, args): Promise<{ ok: true; callId: string } | { ok: false; error: string }>` where `deps = { fetch: typeof fetch; apiKey: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vapi.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { buildCallPayload, triggerCall } from '../lib/vapi'

const base = { assistantId: 'asst_1', phoneNumberId: 'pn_1', name: 'Rohan', phone: '+919820098200' }

describe('buildCallPayload', () => {
  it('builds the Vapi call body with customer + variableValues', () => {
    expect(buildCallPayload(base)).toEqual({
      assistantId: 'asst_1',
      phoneNumberId: 'pn_1',
      customer: { number: '+919820098200', name: 'Rohan' },
      assistantOverrides: { variableValues: { name: 'Rohan' } },
    })
  })
})

describe('triggerCall', () => {
  it('posts to Vapi and returns the call id', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'call_123' }),
    }) as unknown as typeof globalThis.fetch
    const r = await triggerCall({ fetch, apiKey: 'k' }, base)
    expect(r).toEqual({ ok: true, callId: 'call_123' })
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.vapi.ai/call')
    expect(init.headers.Authorization).toBe('Bearer k')
  })
  it('returns an error when Vapi responds non-2xx', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'bad' }),
    }) as unknown as typeof globalThis.fetch
    const r = await triggerCall({ fetch, apiKey: 'k' }, base)
    expect(r).toEqual({ ok: false, error: 'vapi_error_400' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/vapi.test.ts`
Expected: FAIL — cannot find module `../lib/vapi`.

- [ ] **Step 3: Implement**

Create `lib/vapi.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/vapi.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/vapi.ts tests/vapi.test.ts
git commit -m "feat: add Vapi outbound-call client"
```

---

## Task 5: Google Sheets logging module

**Files:**
- Create: `lib/sheets.ts`
- Test: `tests/sheets.test.ts`

**Interfaces:**
- Produces:
  - `type LeadRow = { name: string; phone: string; area: string; foodPref: string; budget: string; recommendations: string; callId: string }`
  - `buildRow(lead: LeadRow, now: Date): string[]` — pure; returns `[isoTimestamp, name, phone, area, foodPref, budget, recommendations, callId]`.
  - `appendLead(deps, lead): Promise<void>` where `deps = { append(range, values): Promise<void>; spreadsheetId: string }` (thin wrapper so the Google client is injected/mocked).

- [ ] **Step 1: Write the failing tests**

Create `tests/sheets.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { buildRow, appendLead } from '../lib/sheets'

const lead = {
  name: 'Rohan', phone: '+919820098200', area: 'Bandra',
  foodPref: 'non-veg', budget: '₹1000', recommendations: 'Bademiya; Carter Road', callId: 'call_123',
}

describe('buildRow', () => {
  it('orders columns to match the sheet header', () => {
    const now = new Date('2026-07-05T10:00:00.000Z')
    expect(buildRow(lead, now)).toEqual([
      '2026-07-05T10:00:00.000Z', 'Rohan', '+919820098200', 'Bandra',
      'non-veg', '₹1000', 'Bademiya; Carter Road', 'call_123',
    ])
  })
})

describe('appendLead', () => {
  it('appends one row to the Leads tab', async () => {
    const append = vi.fn().mockResolvedValue(undefined)
    await appendLead({ append, spreadsheetId: 'sheet_1' }, lead)
    expect(append).toHaveBeenCalledOnce()
    const [range, values] = append.mock.calls[0]
    expect(range).toBe('Sheet1!A:H')
    expect(values[1]).toBe('Rohan')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sheets.test.ts`
Expected: FAIL — cannot find module `../lib/sheets`.

- [ ] **Step 3: Implement**

Create `lib/sheets.ts`:
```ts
import { google } from 'googleapis'

export type LeadRow = {
  name: string; phone: string; area: string; foodPref: string
  budget: string; recommendations: string; callId: string
}

export function buildRow(lead: LeadRow, now: Date): string[] {
  return [
    now.toISOString(), lead.name, lead.phone, lead.area,
    lead.foodPref, lead.budget, lead.recommendations, lead.callId,
  ]
}

type Deps = { append: (range: string, values: string[]) => Promise<void>; spreadsheetId: string }

export async function appendLead(deps: Deps, lead: LeadRow): Promise<void> {
  await deps.append('Sheet1!A:H', buildRow(lead, new Date()))
}

// Real Google client factory (not exercised in unit tests).
export function makeSheetsAppender(serviceAccountJson: string, spreadsheetId: string): Deps {
  const creds = JSON.parse(serviceAccountJson)
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  return {
    spreadsheetId,
    append: async (range, values) => {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW',
        requestBody: { values: [values] },
      })
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/sheets.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/sheets.ts tests/sheets.test.ts
git commit -m "feat: add Google Sheets lead-logging module"
```

---

## Task 6: `/api/call` route

**Files:**
- Create: `app/api/call/route.ts`

**Interfaces:**
- Consumes: `validateCallInput` (Task 2), `checkGuardrails` (Task 3), `triggerCall` + Redis client, env vars.
- Produces: `POST /api/call` accepting `{ name, phone, consent }`, returning `200 { ok: true, callId }` or `4xx { ok: false, error }`.

- [ ] **Step 1: Implement the route**

Create `app/api/call/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { validateCallInput } from '@/lib/validation'
import { checkGuardrails } from '@/lib/guardrails'
import { triggerCall } from '@/lib/vapi'

export const runtime = 'nodejs'

const ERROR_STATUS: Record<string, number> = {
  invalid_input: 400, invalid_name: 400, invalid_phone: 400, consent_required: 400,
  killed: 503, daily_cap: 429, number_rate_limited: 429, ip_rate_limited: 429,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const v = validateCallInput(body)
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: ERROR_STATUS[v.error] ?? 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const redis = Redis.fromEnv()
  const g = await checkGuardrails({ redis }, {
    phone: v.value.phone, ip, dailyCap: Number(process.env.DAILY_CALL_CAP ?? '20'),
  })
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: ERROR_STATUS[g.error] ?? 429 })

  const r = await triggerCall({ fetch, apiKey: process.env.VAPI_API_KEY! }, {
    assistantId: process.env.VAPI_ASSISTANT_ID!,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
    name: v.value.name,
    phone: v.value.phone,
  })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, callId: r.callId })
}
```

- [ ] **Step 2: Confirm the alias**

Ensure `tsconfig.json` `compilerOptions.paths` has `"@/*": ["./*"]` (create-next-app adds this by default). If not, add it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/call/route.ts tsconfig.json
git commit -m "feat: add /api/call route with validation and guardrails"
```

---

## Task 7: `/api/vapi-webhook` route

**Files:**
- Create: `app/api/vapi-webhook/route.ts`

**Interfaces:**
- Consumes: `makeSheetsAppender` + `appendLead` (Task 5).
- Produces: `POST /api/vapi-webhook`. Handles Vapi `tool-calls` messages for the `log_lead` function; appends a row and returns the tool result Vapi expects: `{ results: [{ toolCallId, result }] }`.

Vapi posts `{ message: { type: 'tool-calls', toolCallList: [{ id, function: { name, arguments } }], call: { id } } }`. We read `log_lead` args `{ area, foodPref, budget, recommendations }`, plus the caller name from `call.customer.name`.

- [ ] **Step 1: Implement the route**

Create `app/api/vapi-webhook/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { appendLead, makeSheetsAppender } from '@/lib/sheets'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null)
  const msg = payload?.message
  if (msg?.type !== 'tool-calls') return NextResponse.json({ ok: true })

  const appender = makeSheetsAppender(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, process.env.GOOGLE_SHEET_ID!,
  )
  const results: { toolCallId: string; result: string }[] = []

  for (const tc of msg.toolCallList ?? []) {
    if (tc.function?.name !== 'log_lead') continue
    const a = typeof tc.function.arguments === 'string'
      ? JSON.parse(tc.function.arguments) : tc.function.arguments
    await appendLead(appender, {
      name: msg.call?.customer?.name ?? '',
      phone: msg.call?.customer?.number ?? '',
      area: a.area ?? '', foodPref: a.foodPref ?? '', budget: a.budget ?? '',
      recommendations: Array.isArray(a.recommendations) ? a.recommendations.join('; ') : (a.recommendations ?? ''),
      callId: msg.call?.id ?? '',
    })
    results.push({ toolCallId: tc.id, result: 'logged' })
  }

  return NextResponse.json({ results })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/vapi-webhook/route.ts
git commit -m "feat: add Vapi webhook to log leads to Google Sheets"
```

---

## Task 8: Curated Mumbai spots + Arya system prompt

**Files:**
- Create: `config/mumbai-spots.ts`, `config/arya-prompt.ts`

**Interfaces:**
- Produces: `MUMBAI_SPOTS` (typed array) and `buildAryaPrompt(): string` consumed by Task 9.

> **User action:** Review/edit the 20 spots below before launch — you know Mumbai best. Names/areas/price bands must be current so Arya never recommends a closed place.

- [ ] **Step 1: Create the curated list**

Create `config/mumbai-spots.ts`:
```ts
export type Spot = {
  name: string; area: string; kind: 'food' | 'activity'
  veg: 'veg' | 'non-veg' | 'both'; budget: 1000 | 2000; note: string
}

export const MUMBAI_SPOTS: Spot[] = [
  // ---- Food ----
  { name: 'Bademiya', area: 'Colaba', kind: 'food', veg: 'non-veg', budget: 1000, note: 'legendary late-night seekh & rolls' },
  { name: 'Britannia & Co.', area: 'Ballard Estate', kind: 'food', veg: 'non-veg', budget: 1000, note: 'iconic Parsi berry pulao' },
  { name: 'Swati Snacks', area: 'Tardeo', kind: 'food', veg: 'veg', budget: 1000, note: 'refined Gujarati street food' },
  { name: 'Ram Ashraya', area: 'Matunga', kind: 'food', veg: 'veg', budget: 1000, note: 'classic South-Indian breakfast' },
  { name: 'Cafe Madras', area: 'Matunga', kind: 'food', veg: 'veg', budget: 1000, note: 'filter coffee & dosa institution' },
  { name: 'Elco Market', area: 'Bandra', kind: 'food', veg: 'veg', budget: 1000, note: 'best pani puri & chaat' },
  { name: 'Soul Fry', area: 'Bandra', kind: 'food', veg: 'non-veg', budget: 1000, note: 'Goan-coastal, buzzing vibe' },
  { name: 'Mohammed Ali Road', area: 'South Mumbai', kind: 'food', veg: 'non-veg', budget: 1000, note: 'street-food crawl, esp. Ramzan' },
  { name: 'Prithvi Cafe', area: 'Juhu', kind: 'food', veg: 'both', budget: 1000, note: 'chai + theatre courtyard charm' },
  { name: 'Gajalee', area: 'Vile Parle', kind: 'food', veg: 'non-veg', budget: 2000, note: 'Malvani seafood, prawns & bombil' },
  { name: 'Pali Village Cafe', area: 'Bandra', kind: 'food', veg: 'both', budget: 2000, note: 'rustic-European, date-night vibe' },
  { name: 'The Bombay Canteen', area: 'Lower Parel', kind: 'food', veg: 'both', budget: 2000, note: 'inventive modern Indian' },
  { name: 'Trishna', area: 'Fort', kind: 'food', veg: 'non-veg', budget: 2000, note: 'famous butter-pepper-garlic crab' },
  { name: 'Bastian', area: 'Worli', kind: 'food', veg: 'non-veg', budget: 2000, note: 'upscale seafood, lively crowd' },
  // ---- Activities ----
  { name: 'Marine Drive sunset walk', area: 'South Mumbai', kind: 'activity', veg: 'both', budget: 1000, note: 'free Queen’s Necklace stroll' },
  { name: 'Carter Road & Bandstand', area: 'Bandra', kind: 'activity', veg: 'both', budget: 1000, note: 'seaside promenade & cafes' },
  { name: 'Kala Ghoda art walk', area: 'Fort', kind: 'activity', veg: 'both', budget: 1000, note: 'galleries & heritage lanes' },
  { name: 'Prithvi Theatre play', area: 'Juhu', kind: 'activity', veg: 'both', budget: 1000, note: 'intimate live theatre' },
  { name: 'Elephanta Caves ferry', area: 'Gateway of India', kind: 'activity', veg: 'both', budget: 2000, note: 'island caves day-trip' },
  { name: 'Kanheri Caves, SGNP', area: 'Borivali', kind: 'activity', veg: 'both', budget: 1000, note: 'forest trail & rock-cut caves' },
]
```

- [ ] **Step 2: Create the prompt builder**

Create `config/arya-prompt.ts`:
```ts
import { MUMBAI_SPOTS } from './mumbai-spots'

export function buildAryaPrompt(): string {
  const catalog = MUMBAI_SPOTS.map(
    s => `- ${s.name} (${s.area}, ${s.kind}, ${s.veg}, ₹${s.budget}): ${s.note}`,
  ).join('\n')

  return `You are Arya, a warm, witty Mumbai local who helps people find great food and fun.
You speak natural Hinglish (mix Hindi and English the way young Mumbaikars actually do). Keep it casual and friendly.

HARD RULES:
- The whole call must finish within ~50 seconds. Be brisk. No rambling.
- Recommend EXACTLY 2 places, each with a one-line reason. Never more.
- ONLY recommend places from the CATALOG below. Never invent a place.
- Speak in short spoken sentences (this is a phone call, not an essay).

FLOW (move fast):
1. Greet by name (the caller's name is {{name}}): "Hey {{name}}! Arya here, your Mumbai plug. Quick help — where in the city are you?"
2. Ask food or fun, and veg/non-veg: "Cool. Khaana ya masti? And veg ya non-veg?"
3. Ask budget: "Budget around ₹1000 ya ₹2000?"
4. Give EXACTLY 2 matching picks from the catalog (match area if possible, else nearby), one line each.
5. Call the log_lead tool with what you learned.
6. Wrap warmly in one line: "Noted! Enjoy Mumbai, {{name}}. Bye!"

CATALOG:
${catalog}`
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add config/mumbai-spots.ts config/arya-prompt.ts
git commit -m "feat: add curated Mumbai spots and Arya system prompt"
```

---

## Task 9: Create the "Arya" Vapi assistant

**Files:**
- Create: `scripts/upsert-assistant.ts`

**Interfaces:**
- Consumes: `buildAryaPrompt` (Task 8), `VAPI_API_KEY`, `GEMINI_API_KEY`.
- Produces: an assistant in Vapi; prints its id to paste into `.env.local` as `VAPI_ASSISTANT_ID`.

> **Confirm against live Vapi docs:** the exact Gemini realtime/Live model identifier and the credential-attachment method can change. Set the model id below to the current Gemini Live model shown in your Vapi dashboard's Google provider list, and attach your `GEMINI_API_KEY` under Vapi → Providers → Google (so Gemini bills to your GCP-credit project). The script sets everything else.

- [ ] **Step 1: Write the upsert script**

Create `scripts/upsert-assistant.ts`:
```ts
import { buildAryaPrompt } from '../config/arya-prompt'

const WEBHOOK_URL = process.env.PUBLIC_BASE_URL // e.g. https://your-app.vercel.app
  ? `${process.env.PUBLIC_BASE_URL}/api/vapi-webhook`
  : (() => { throw new Error('Set PUBLIC_BASE_URL to your deployed URL') })()

const assistant = {
  name: 'Arya - Mumbai Concierge',
  firstMode: 'assistant-speaks-first',
  maxDurationSeconds: 60,
  model: {
    provider: 'google',
    model: 'gemini-2.0-flash-realtime', // TODO confirm current Gemini Live model id in Vapi
    messages: [{ role: 'system', content: buildAryaPrompt() }],
    tools: [{
      type: 'function',
      function: {
        name: 'log_lead',
        description: 'Record the caller preferences and the 2 recommendations given.',
        parameters: {
          type: 'object',
          properties: {
            area: { type: 'string' },
            foodPref: { type: 'string', enum: ['veg', 'non-veg'] },
            budget: { type: 'string', enum: ['₹1000', '₹2000'] },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
          required: ['area', 'recommendations'],
        },
      },
      server: { url: WEBHOOK_URL },
    }],
  },
}

async function main() {
  const res = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(assistant),
  })
  const data = await res.json()
  if (!res.ok) { console.error('Failed:', data); process.exit(1) }
  console.log('Assistant created. Set VAPI_ASSISTANT_ID=' + data.id)
}
main()
```

- [ ] **Step 2: Run it (after Task 11 gives you PUBLIC_BASE_URL, or use a temporary tunnel)**

Run: `PUBLIC_BASE_URL=https://<your-app>.vercel.app VAPI_API_KEY=... npx tsx scripts/upsert-assistant.ts`
Expected: prints `Assistant created. Set VAPI_ASSISTANT_ID=asst_...`. Paste that into `.env.local` and Vercel env.

- [ ] **Step 3: Commit**

```bash
git add scripts/upsert-assistant.ts
git commit -m "feat: add script to create the Arya Vapi assistant"
```

---

## Task 10: Front-end form

**Files:**
- Modify: `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `POST /api/call`.
- Produces: a form (name, phone, consent checkbox) that calls the API and shows status.

- [ ] **Step 1: Implement the page**

Replace `app/page.tsx`:
```tsx
'use client'
import { useState } from 'react'

export default function Home() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setStatus(null)
    const res = await fetch('/api/call', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, consent }),
    })
    const data = await res.json()
    setLoading(false)
    setStatus(data.ok ? '📞 Arya is calling you now — pick up!' : `Couldn’t call: ${data.error}`)
  }

  return (
    <main className="wrap">
      <h1>Talk to Arya 🎙️</h1>
      <p>Your Mumbai food & fun plug. Drop your number and Arya will call you.</p>
      <form onSubmit={submit}>
        <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
        <input placeholder="Indian mobile (e.g. 98200 98200)" value={phone} onChange={e => setPhone(e.target.value)} required />
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          I agree to receive a one-time demo call on this number.
        </label>
        <button disabled={loading || !consent}>{loading ? 'Calling…' : 'Call me'}</button>
      </form>
      {status && <p className="status">{status}</p>}
    </main>
  )
}
```

- [ ] **Step 2: Minimal styles**

Append to `app/globals.css`:
```css
.wrap { max-width: 420px; margin: 8vh auto; padding: 0 20px; font-family: system-ui, sans-serif; }
.wrap h1 { font-size: 2rem; }
form { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
input[type=text], form > input { padding: 12px; font-size: 1rem; border: 1px solid #ccc; border-radius: 8px; }
.consent { display: flex; gap: 8px; align-items: flex-start; font-size: .9rem; }
button { padding: 12px; font-size: 1rem; border: 0; border-radius: 8px; background: #111; color: #fff; }
button:disabled { opacity: .5; }
.status { margin-top: 16px; font-weight: 600; }
```

- [ ] **Step 3: Run the dev server and eyeball it**

Run: `npm run dev` then open http://localhost:3000
Expected: form renders; submitting with an unchecked box keeps the button disabled.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: add Arya call-request form UI"
```

---

## Task 11: Deploy + end-to-end verification

**Files:** none (deployment + manual verification).

- [ ] **Step 1: Push and deploy**

```bash
git push
```
Import the repo in Vercel. Add ALL env vars from `.env.local` to the Vercel project (Production). Deploy. Note the URL → `PUBLIC_BASE_URL`.

- [ ] **Step 2: Create the assistant against the live URL**

Run Task 9 Step 2 with `PUBLIC_BASE_URL=<vercel-url>`. Paste `VAPI_ASSISTANT_ID` into Vercel env and redeploy.

- [ ] **Step 3: Dev-safe call to your OWN verified number (Twilio trial, ~free)**

On the deployed site, enter your name + your Twilio-verified mobile + consent → "Call me".
Expected: your phone rings; Arya greets you by name, runs the flow in Hinglish, gives 2 picks, wraps under 60s.

- [ ] **Step 4: Confirm the log landed**

Open the "Arya Leads" Google Sheet.
Expected: one new row with your name, phone, area, food pref, budget, the 2 recommendations, and the call id.

- [ ] **Step 5: Verify each guardrail**
  - Submit the same number again → expect `number_rate_limited`.
  - Set Redis `killswitch=on` (Upstash console) → submit → expect `killed`. Set it back.
  - Submit with the consent box unchecked (via curl) → expect `consent_required`.

- [ ] **Step 6: Go-live checklist (before posting on LinkedIn/WhatsApp)**
  - Upgrade Twilio from trial → add **$12** balance (enables calls to non-verified numbers).
  - Set Twilio billing alert / low-balance auto-recharge OFF (hard cap by balance).
  - Test with **3–4 friends' real numbers** to confirm deliverability (foreign caller ID can be carrier-flagged). If calls don't land, fall back to the demo video.
  - Record the demo video now as the always-available fallback.

- [ ] **Step 7: Commit any final config**

```bash
git add -A && git commit -m "chore: production env + go-live notes" || echo "nothing to commit"
git push
```

---

## Self-Review

**Spec coverage:** Vapi ✅(T0,9) · Gemini Live ✅(T9) · Twilio outbound +91 ✅(T0,9) · Arya persona/Hinglish ✅(T8,9) · flow area→veg→budget→2 recs→log→bye ≤60s ✅(T8,9, Global Constraints) · curated list ✅(T8) · log to Sheet ✅(T5,7) · Next.js/Vercel ✅(T1,11) · form + link distribution ✅(T10) · guardrails consent/rate-limit/1-min cap/daily cap/kill switch ✅(T2,3,9, Global) · cost model ($300 GCP for Gemini, $12 Vapi+Twilio) ✅(T0,11) · open items (verify Twilio rate, supply 20 spots, BYOK-Gemini-to-GCP) ✅(T0,8,9).

**Placeholders:** The only `TODO` is the Gemini Live model id and Vapi provider-credential attachment (T9) — genuine external config that must be read from the live Vapi dashboard, not inventable here; flagged explicitly, not hidden.

**Type consistency:** `LeadRow` fields (name, phone, area, foodPref, budget, recommendations, callId) match across `lib/sheets.ts`, the webhook (T7), and the `log_lead` tool params (T9). `triggerCall`/`buildCallPayload` arg shape consistent across T4 and T6. Sheet header (T0) matches `buildRow` order (T5).
