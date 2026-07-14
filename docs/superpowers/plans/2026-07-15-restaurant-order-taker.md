# Restaurant Order-Taker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the existing LiveKit + Gemini Live voice agent from an outbound Mumbai concierge into an inbound restaurant order-taker that answers calls to Gattu's Chinese, takes an order in Hinglish grounded strictly to a real menu, and writes it to a live kitchen dashboard.

**Architecture:** Customer dials an Exotel DID → Exotel vSIP → LiveKit inbound trunk + dispatch rule → the agent worker (`agent/arya.ts`) joins the room and greets. Arya is grounded to `config/menu.ts` (real Gattu's Chinese menu, half/full sizes, tags). At the end of the call she calls one `capture_order` tool; the worker rebuilds the order **server-side from config prices** (`lib/orders.ts`, pure + unit-tested) and saves it to Upstash Redis. The Next.js app becomes the kitchen dashboard (`/` + `GET /api/orders`) that polls for new orders. All outbound/Twilio code is deleted.

**Tech Stack:** TypeScript, LiveKit Agents (`@livekit/agents` + `@livekit/agents-plugin-google`), Gemini Live via Vertex AI (`gemini-live-2.5-flash-native-audio`, voice `Sulafat`), Exotel SIP (inbound), Upstash Redis, Next.js 16 (App Router), Vitest, Zod.

## Global Constraints

- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** Functions take their external client (`RedisLike`, etc.) as a parameter so tests use fakes — **no network in tests**. Real client factories are separate and not unit-tested.
- **The agent must never invent a dish, size, or price.** `config/menu.ts` is the only source of truth, and `buildOrder` recomputes the total server-side from config prices — the model's arithmetic is never trusted.
- **Error strings are a contract.** `buildOrder` returns string error codes (`unknown_item`, `unknown_size`, `invalid_qty`, `address_required`, `empty_order`).
- **API routes must set `export const runtime = 'nodejs'`** (LiveKit/Redis server SDKs need Node, not Edge).
- **Gemini auth is Vertex ADC via env** (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`) — never an API key.
- **Model is `gemini-live-2.5-flash-native-audio`** (the Vertex id) in `us-central1`, voice `Sulafat`. Do NOT swap to `gemini-3.1-flash-live-preview` (the Live bidi WebSocket rejects it with close code 1008).
- **Secrets only in `.env.local`** (gitignored). `.env.example` documents keys with blank values.
- **Telephony is Exotel-only.** No Twilio, no outbound dial. The agent joins an inbound call; it never places one.
- Small focused files, TypeScript, no unrequested dependencies. Commit after every task.

## File Structure

**Create:**
- `lib/menu.ts` — menu types (`MenuItem`, `Size`, `Category`, `Tag`) + pure helpers (`halfPrice`, `priceOf`, `findMenuItem`, `renderMenuForPrompt`). No data, no I/O.
- `config/menu.ts` — the real Gattu's Chinese data (`RESTAURANT`, `MENU`). Imports types/helpers from `lib/menu.ts`.
- `lib/orders.ts` — `Order` types, pure `buildOrder`, injected-deps `saveOrder`/`listOrders`, `makeRedis` factory.
- `config/order-prompt.ts` — `buildOrderPrompt(menu, restaurant)`, the Hinglish order-taker brain.
- `app/api/orders/route.ts` — `GET` returning saved orders for the dashboard.
- `tests/menu.test.ts`, `tests/menu-data.test.ts`, `tests/orders.test.ts`, `tests/order-prompt.test.ts`.

**Modify:**
- `agent/arya.ts` — outbound dial → inbound accept; `log_lead` → `capture_order`; `MAX_CALL_MS` 2 min → 5 min.
- `app/page.tsx` — call form → kitchen dashboard.
- `app/globals.css` / `app/page.module.css` — dashboard styles.
- `.env.example`, `README.md`, `CLAUDE.md`, `package.json` — reflect the pivot.

**Delete (dead outbound code):**
- `lib/guardrails.ts`, `lib/validation.ts`, `lib/sheets.ts`, `lib/livekit.ts`
- `config/arya-prompt.ts`, `app/api/call/route.ts` (and the `app/api/call/` dir), `_dispatch_once.ts`
- `tests/guardrails.test.ts`, `tests/validation.test.ts`, `tests/sheets.test.ts`, `tests/livekit.test.ts`
- deps: `libphonenumber-js`, `googleapis`, `@upstash/ratelimit`

---

### Task 1: Menu domain (types + pure helpers)

Pure, data-free menu logic. `halfPrice` encodes the restaurant's real convention: **half is a bit over half the full price, rounded up to the next ₹10** — verified against the owner's examples (full 280 → half 150, full 300 → half 160, full 270 → half 140).

**Files:**
- Create: `lib/menu.ts`
- Test: `tests/menu.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Size = 'full' | 'half'`
  - `type Category = 'Soup' | 'Starter' | 'Noodles' | 'Rice' | 'Side Dish'`
  - `type Tag = 'bestseller' | 'popular' | 'spicy' | 'sweet' | 'chef-special'`
  - `type MenuItem = { id: string; name: string; veg: boolean; category: Category; sizes: { full: number; half?: number }; tags: Tag[] }`
  - `type Restaurant = { name: string; readyEstimateMins: number }`
  - `halfPrice(full: number): number`
  - `priceOf(item: MenuItem, size: Size): number | undefined`
  - `findMenuItem(menu: MenuItem[], id: string): MenuItem | undefined`
  - `renderMenuForPrompt(menu: MenuItem[], restaurant: Restaurant): string`

- [ ] **Step 1: Write the failing test**

Create `tests/menu.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  halfPrice, priceOf, findMenuItem, renderMenuForPrompt,
  type MenuItem, type Restaurant,
} from '../lib/menu'

const noodles: MenuItem = {
  id: 'veg-hakka-noodles', name: 'Veg Hakka Noodles', veg: true,
  category: 'Noodles', sizes: { full: 190, half: 100 }, tags: ['bestseller'],
}
const soup: MenuItem = {
  id: 'veg-clear-soup', name: 'Veg Clear Soup', veg: true,
  category: 'Soup', sizes: { full: 120 }, tags: [],
}
const menu = [noodles, soup]
const restaurant: Restaurant = { name: "Gattu's Chinese", readyEstimateMins: 20 }

describe('halfPrice', () => {
  it("matches the owner's stated examples", () => {
    expect(halfPrice(280)).toBe(150)
    expect(halfPrice(300)).toBe(160)
    expect(halfPrice(270)).toBe(140)
  })

  it('rounds up to the next 10', () => {
    expect(halfPrice(190)).toBe(100)
    expect(halfPrice(200)).toBe(110)
    expect(halfPrice(340)).toBe(180)
  })
})

describe('priceOf', () => {
  it('returns the price for a size that exists', () => {
    expect(priceOf(noodles, 'full')).toBe(190)
    expect(priceOf(noodles, 'half')).toBe(100)
  })

  it('returns undefined for a size the item does not have', () => {
    expect(priceOf(soup, 'half')).toBeUndefined()
  })
})

describe('findMenuItem', () => {
  it('finds by id', () => {
    expect(findMenuItem(menu, 'veg-clear-soup')).toBe(soup)
  })

  it('returns undefined for an unknown id', () => {
    expect(findMenuItem(menu, 'butter-chicken')).toBeUndefined()
  })
})

describe('renderMenuForPrompt', () => {
  it('lists every item with its id, prices and tags, grouped by category', () => {
    const text = renderMenuForPrompt(menu, restaurant)
    expect(text).toContain("Gattu's Chinese")
    expect(text).toContain('Noodles')
    expect(text).toContain('veg-hakka-noodles')
    expect(text).toContain('Veg Hakka Noodles')
    expect(text).toContain('full 190')
    expect(text).toContain('half 100')
    expect(text).toContain('bestseller')
    expect(text).toContain('veg-clear-soup')
  })

  it('marks items that have no half portion', () => {
    const text = renderMenuForPrompt(menu, restaurant)
    expect(text).toMatch(/Veg Clear Soup.*full only/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/menu.test.ts`
Expected: FAIL — cannot find module `../lib/menu`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/menu.ts`:

```ts
// Menu domain: types + pure helpers. No data (see config/menu.ts), no I/O.
export type Size = 'full' | 'half'
export type Category = 'Soup' | 'Starter' | 'Noodles' | 'Rice' | 'Side Dish'
export type Tag = 'bestseller' | 'popular' | 'spicy' | 'sweet' | 'chef-special'

export type MenuItem = {
  id: string
  name: string
  veg: boolean
  category: Category
  sizes: { full: number; half?: number }
  tags: Tag[]
}

export type Restaurant = { name: string; readyEstimateMins: number }

// Gattu's half-plate convention: a bit over half the full price, rounded up to
// the next ₹10 (owner's examples: 280→150, 300→160, 270→140).
export function halfPrice(full: number): number {
  return Math.ceil((full / 2 + 5) / 10) * 10
}

export function priceOf(item: MenuItem, size: Size): number | undefined {
  return size === 'half' ? item.sizes.half : item.sizes.full
}

export function findMenuItem(menu: MenuItem[], id: string): MenuItem | undefined {
  return menu.find((i) => i.id === id)
}

// The menu as the agent sees it. Ids are included so capture_order can echo
// them back exactly; prices are here so Arya quotes real numbers.
export function renderMenuForPrompt(menu: MenuItem[], restaurant: Restaurant): string {
  const categories = [...new Set(menu.map((i) => i.category))]
  const lines = categories.map((category) => {
    const items = menu
      .filter((i) => i.category === category)
      .map((i) => {
        const prices = i.sizes.half
          ? `full ${i.sizes.full}, half ${i.sizes.half}`
          : `full ${i.sizes.full} (full only)`
        const tags = i.tags.length ? ` [${i.tags.join(', ')}]` : ''
        const veg = i.veg ? 'veg' : 'non-veg'
        return `- ${i.id} | ${i.name} | ${veg} | ${prices}${tags}`
      })
      .join('\n')
    return `${category}:\n${items}`
  })
  return `${restaurant.name} — MENU (prices in ₹)\n\n${lines.join('\n\n')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/menu.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/menu.ts tests/menu.test.ts
git commit -m "feat: menu domain types and pure helpers"
```

---

### Task 2: The real Gattu's Chinese menu data

Transcribed from the restaurant's printed menu (w.e.f. 20.04.2026). Half prices are **derived once at module load** via `halfPrice` and are concrete values on `MenuItem.sizes.half` — the model never computes a price. Half plates apply to Noodles, Rice and Side Dishes; Soups and Starters are single-portion (the owner can add a `half` later by passing an override).

**Files:**
- Create: `config/menu.ts`
- Test: `tests/menu-data.test.ts`

**Interfaces:**
- Consumes: `MenuItem`, `Category`, `Tag`, `Restaurant`, `halfPrice` from `lib/menu.ts` (Task 1).
- Produces: `RESTAURANT: Restaurant`, `MENU: MenuItem[]` from `config/menu.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/menu-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MENU, RESTAURANT } from '../config/menu'
import { halfPrice, findMenuItem } from '../lib/menu'

describe('Gattu\'s menu data', () => {
  it('has a restaurant name and a ready estimate', () => {
    expect(RESTAURANT.name).toBe("Gattu's Chinese")
    expect(RESTAURANT.readyEstimateMins).toBeGreaterThan(0)
  })

  it('has every item with a unique id', () => {
    const ids = MENU.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(MENU.length).toBeGreaterThan(60)
  })

  it('prices every item with a positive full price', () => {
    for (const item of MENU) expect(item.sizes.full).toBeGreaterThan(0)
  })

  it('gives Noodles, Rice and Side Dishes a half price derived from the full price', () => {
    for (const item of MENU) {
      if (['Noodles', 'Rice', 'Side Dish'].includes(item.category)) {
        expect(item.sizes.half).toBe(halfPrice(item.sizes.full))
        expect(item.sizes.half!).toBeLessThan(item.sizes.full)
      }
    }
  })

  it('serves Soups and Starters full-only', () => {
    for (const item of MENU) {
      if (['Soup', 'Starter'].includes(item.category)) {
        expect(item.sizes.half).toBeUndefined()
      }
    }
  })

  it('carries the real prices from the printed menu', () => {
    expect(findMenuItem(MENU, 'veg-hakka-noodles')!.sizes.full).toBe(190)
    expect(findMenuItem(MENU, 'chicken-lollypop')!.sizes.full).toBe(200)
    expect(findMenuItem(MENU, 'paneer-sz-manchurian-rice')!.sizes.full).toBe(340)
    expect(findMenuItem(MENU, 'veg-clear-soup')!.sizes.full).toBe(120)
    expect(findMenuItem(MENU, 'chicken-lollypop-gravy')!.sizes.full).toBe(350)
  })

  it('marks the chicken and egg dishes non-veg and the rest veg', () => {
    expect(findMenuItem(MENU, 'chicken-fried-rice')!.veg).toBe(false)
    expect(findMenuItem(MENU, 'egg-rice')!.veg).toBe(false)
    expect(findMenuItem(MENU, 'veg-fried-rice')!.veg).toBe(true)
    expect(findMenuItem(MENU, 'paneer-chilly-sauce')!.veg).toBe(true)
  })

  it('tags dishes so Arya can recommend with personality', () => {
    expect(findMenuItem(MENU, 'veg-hakka-noodles')!.tags).toContain('bestseller')
    expect(findMenuItem(MENU, 'veg-szechwan-noodles')!.tags).toContain('spicy')
    expect(findMenuItem(MENU, 'veg-sweet-sour')!.tags).toContain('sweet')
    expect(findMenuItem(MENU, 'gattus-special-rice-veg')!.tags).toContain('chef-special')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/menu-data.test.ts`
Expected: FAIL — cannot find module `../config/menu`.

- [ ] **Step 3: Write minimal implementation**

Create `config/menu.ts`:

```ts
// Gattu's Chinese — the real printed menu (w.e.f. 20.04.2026).
// This is the ONLY source of dishes and prices. The agent is grounded strictly
// to it and must never invent a dish, size or price.
//
// Half plates: the kitchen serves half portions of Noodles, Rice and Side
// Dishes only; Soups and Starters are single-portion. Half prices are not
// printed — they follow the owner's convention (see halfPrice in lib/menu.ts).
import { halfPrice, type Category, type MenuItem, type Restaurant, type Tag } from '../lib/menu'

export const RESTAURANT: Restaurant = {
  name: "Gattu's Chinese",
  readyEstimateMins: 20,
}

const HALF_CATEGORIES: Category[] = ['Noodles', 'Rice', 'Side Dish']

function item(
  id: string, name: string, full: number, veg: boolean,
  category: Category, tags: Tag[] = [],
): MenuItem {
  return {
    id, name, veg, category, tags,
    sizes: HALF_CATEGORIES.includes(category)
      ? { full, half: halfPrice(full) }
      : { full },
  }
}

export const MENU: MenuItem[] = [
  // ---- VEG SOUP ----
  item('veg-clear-soup', 'Veg Clear Soup', 120, true, 'Soup'),
  item('veg-sweet-corn-soup', 'Veg Sweet Corn Soup', 140, true, 'Soup', ['sweet', 'popular']),
  item('veg-manchow-soup', 'Veg Manchow Soup', 140, true, 'Soup', ['bestseller', 'spicy']),
  item('veg-hot-n-sour-soup', "Veg Hot 'n' Sour Soup", 140, true, 'Soup', ['spicy']),
  item('veg-talumein-soup', 'Veg Talumein Soup', 140, true, 'Soup'),
  item('veg-noodle-soup', 'Veg Noodle Soup', 140, true, 'Soup'),
  item('veg-lung-fung-soup', 'Veg Lung Fung Soup (egg)', 160, true, 'Soup'),
  item('veg-pretty-flora-soup', 'GC Pretty Flora Special Soup (veg)', 160, true, 'Soup', ['chef-special']),
  item('veg-cocktail-soup', 'Veg Cocktail Soup', 160, true, 'Soup'),

  // ---- CHICKEN SOUP ----
  item('chicken-clear-soup', 'Chicken Clear Soup', 150, false, 'Soup'),
  item('chicken-sweet-corn-soup', 'Chicken Sweet Corn Soup', 150, false, 'Soup', ['sweet', 'popular']),
  item('chicken-manchow-soup', 'Chicken Manchow Soup', 150, false, 'Soup', ['bestseller', 'spicy']),
  item('chicken-hot-n-sour-soup', "Chicken Hot 'n' Sour Soup", 150, false, 'Soup', ['spicy']),
  item('chicken-talumein-soup', 'Chicken Talumein Soup', 150, false, 'Soup'),
  item('chicken-noodle-soup', 'Chicken Noodle Soup', 150, false, 'Soup'),
  item('chicken-lung-fung-soup', 'Chicken Lung Fung Soup (egg)', 160, false, 'Soup'),
  item('chicken-pretty-flora-soup', 'GC Pretty Flora Special Soup (chicken)', 160, false, 'Soup', ['chef-special']),
  item('chicken-cocktail-soup', 'Chicken Cocktail Soup', 160, false, 'Soup'),

  // ---- VEG STARTER ----
  item('veg-spring-roll', 'Veg Spring Roll', 180, true, 'Starter', ['popular']),
  item('veg-bhel', 'Veg Bhel', 180, true, 'Starter'),
  item('paneer-finger', 'Paneer Finger', 300, true, 'Starter'),
  item('veg-crispy', 'Veg Crispy', 200, true, 'Starter'),
  item('paneer-crispy', 'Paneer Crispy', 300, true, 'Starter', ['popular']),

  // ---- CHICKEN STARTER ----
  item('chicken-spring-roll', 'Chicken Spring Roll', 200, false, 'Starter', ['popular']),
  item('chicken-finger', 'Chicken Finger', 200, false, 'Starter'),
  item('chicken-lollypop', 'Chicken Lollypop (8 pcs)', 200, false, 'Starter', ['bestseller']),
  item('chicken-bhel', 'Chicken Bhel', 200, false, 'Starter'),
  item('chicken-crispy', 'Chicken Crispy', 300, false, 'Starter', ['popular']),
  item('chicken-lollypop-dry-chilli', 'Chicken Lollypop Dry Chilli', 350, false, 'Starter', ['spicy', 'popular']),
  item('diced-dry-chilli', 'Diced Dry Chilli Chicken', 300, false, 'Starter', ['spicy']),
  item('roasted-chicken-dry', 'Roasted Chicken Dry', 300, false, 'Starter'),
  item('chicken-wanton-fried', 'Chicken Wanton (Fried)', 300, false, 'Starter'),
  item('crispy-thread-chicken', 'Crispy Thread Chicken', 300, false, 'Starter'),
  item('chicken-black-pepper', 'Chicken in Black Pepper / Black Bean / Hunan', 300, false, 'Starter', ['spicy']),
  item('papper-chicken', 'Papper Chicken', 300, false, 'Starter', ['spicy']),

  // ---- VEG NOODLES ----
  item('veg-hakka-noodles', 'Veg Hakka Noodles', 190, true, 'Noodles', ['bestseller']),
  item('veg-singapore-noodles', 'Veg Singapore Noodles', 200, true, 'Noodles'),
  item('veg-szechwan-noodles', 'Veg Szechwan Noodles', 200, true, 'Noodles', ['spicy', 'popular']),
  item('veg-chowmein', 'Veg Chowmein', 200, true, 'Noodles', ['popular']),
  item('veg-american-chopsuey', 'Veg American Chopsuey', 200, true, 'Noodles', ['sweet']),
  item('veg-chinese-chopsuey', 'Veg Chinese Chopsuey', 200, true, 'Noodles'),
  item('veg-szechwan-chopsuey', 'Veg Szechwan Chopsuey', 200, true, 'Noodles', ['spicy']),
  item('veg-special-noodles', 'Veg Special Noodles', 260, true, 'Noodles', ['chef-special']),
  item('veg-tripal-szechwan-noodles', 'Veg Tripal Szechwan Noodles', 260, true, 'Noodles', ['spicy']),
  item('veg-manchurian-noodles', 'Veg Manchurian Noodles', 260, true, 'Noodles', ['bestseller']),
  item('paneer-chowmein', 'Paneer Chowmein', 300, true, 'Noodles'),
  item('paneer-american-chopsuey', 'Paneer American Chopsuey', 300, true, 'Noodles', ['sweet']),
  item('paneer-chinese-chopsuey', 'Paneer Chinese Chopsuey', 300, true, 'Noodles'),

  // ---- CHICKEN NOODLES ----
  item('chicken-hakka-noodles', 'Chicken Hakka Noodles', 200, false, 'Noodles', ['bestseller']),
  item('chicken-singapore-noodles', 'Chicken Singapore Noodles', 220, false, 'Noodles'),
  item('chicken-szechwan-noodles', 'Chicken Szechwan Noodles', 220, false, 'Noodles', ['spicy', 'popular']),
  item('chicken-chowmein', 'Chicken Chowmein', 220, false, 'Noodles', ['popular']),
  item('chicken-american-chopsuey', 'Chicken American Chopsuey', 220, false, 'Noodles', ['sweet']),
  item('chicken-chinese-chopsuey', 'Chicken Chinese Chopsuey', 220, false, 'Noodles'),
  item('chicken-szechwan-chopsuey', 'Chicken Szechwan Chopsuey', 250, false, 'Noodles', ['spicy']),
  item('gattus-special-noodles', "Gattu's Special Noodles", 300, false, 'Noodles', ['chef-special']),
  item('chicken-tripal-noodles', 'Chicken Tripal Noodles', 300, false, 'Noodles'),
  item('chicken-manchurian-noodles', 'Chicken Manchurian Noodles', 300, false, 'Noodles', ['bestseller']),

  // ---- VEG RICE ----
  item('veg-fried-rice', 'Veg Fried Rice', 180, true, 'Rice', ['bestseller']),
  item('veg-singapore-rice', 'Veg Singapore Rice', 200, true, 'Rice'),
  item('veg-szechwan-rice', 'Veg Szechwan Rice', 200, true, 'Rice', ['spicy', 'popular']),
  item('veg-hong-kong-rice', 'Veg Hong Kong Rice', 200, true, 'Rice'),
  item('veg-shangai-rice', 'Veg Shangai Rice', 200, true, 'Rice'),
  item('veg-combination-rice', 'Veg Combination Rice', 190, true, 'Rice'),
  item('veg-ginger-rice', 'Veg Ginger Rice', 200, true, 'Rice'),
  item('veg-stewed-rice', 'Veg Stewed Rice', 200, true, 'Rice'),
  item('veg-tripal-szechwan-rice', 'Veg Tripal Szechwan Rice', 260, true, 'Rice', ['spicy']),
  item('gattus-special-rice-veg', "Gattu's Special Rice (veg)", 260, true, 'Rice', ['chef-special']),
  item('veg-lakhpati-rice', 'Veg Lakhpati Rice', 260, true, 'Rice'),
  item('veg-manchurian-rice', 'Veg Manchurian Rice', 260, true, 'Rice', ['bestseller']),
  item('paneer-special-rice', 'Paneer Special Rice', 320, true, 'Rice'),
  item('paneer-sz-lakhpati-rice', 'Paneer Szechwan Lakhpati Rice', 340, true, 'Rice', ['spicy']),
  item('paneer-sz-special-rice', 'Paneer Szechwan Special Rice', 340, true, 'Rice', ['spicy']),
  item('paneer-sz-manchurian-rice', 'Paneer Szechwan Manchurian Rice', 340, true, 'Rice', ['spicy']),

  // ---- CHICKEN / EGG RICE ----
  item('egg-rice', 'Egg Rice', 190, false, 'Rice'),
  item('chicken-fried-rice', 'Chicken Fried Rice', 200, false, 'Rice', ['bestseller']),
  item('chicken-singapore-rice', 'Chicken Singapore Rice', 220, false, 'Rice'),
  item('chicken-szechwan-rice', 'Chicken Szechwan Rice', 220, false, 'Rice', ['spicy', 'popular']),
  item('chicken-hong-kong-rice', 'Chicken Hong Kong Rice', 220, false, 'Rice'),
  item('chicken-combination-rice', 'Chicken Combination Rice', 220, false, 'Rice'),
  item('chicken-ginger-rice', 'Chicken Ginger Rice', 220, false, 'Rice'),
  item('chicken-stewed-rice', 'Chicken Stewed Rice', 290, false, 'Rice'),
  item('chicken-tripal-szechwan-rice', 'Chicken Tripal Szechwan Rice', 300, false, 'Rice', ['spicy']),
  item('gattus-special-rice-chicken', "Gattu's Special Rice (chicken)", 300, false, 'Rice', ['chef-special']),
  item('chicken-lakhpati-rice', 'Chicken Lakhpati Rice', 300, false, 'Rice'),
  item('chicken-manchurian-rice', 'Chicken Manchurian Rice', 300, false, 'Rice', ['bestseller']),
  item('chicken-sz-lakhpati-rice', 'Chicken Szechwan Lakhpati Rice', 320, false, 'Rice', ['spicy']),
  item('gattus-sz-special-rice', "Gattu's Szechwan Special Rice", 320, false, 'Rice', ['chef-special', 'spicy']),
  item('chicken-sz-manchurian-rice', 'Chicken Szechwan Manchurian Rice', 320, false, 'Rice', ['spicy']),

  // ---- VEG SIDE DISHES (gravy & dry) ----
  item('veg-manchurian', 'Veg Manchurian', 190, true, 'Side Dish', ['bestseller']),
  item('veg-chilly-sauce', 'Veg Chilly Sauce', 190, true, 'Side Dish', ['spicy']),
  item('veg-szechwan-sauce', 'Veg in Szechwan Sauce', 190, true, 'Side Dish', ['spicy']),
  item('veg-garlic', 'Veg in Garlic', 190, true, 'Side Dish'),
  item('veg-hot-garlic', 'Veg in Hot Garlic', 190, true, 'Side Dish', ['spicy']),
  item('veg-sweet-sour', 'Veg in Sweet & Sour', 200, true, 'Side Dish', ['sweet', 'popular']),
  item('veg-chow-chow', 'Veg Chow Chow', 200, true, 'Side Dish'),
  item('veg-hong-kong', 'Veg Hong Kong', 200, true, 'Side Dish'),
  item('veg-mangolian', 'Veg Mangolian', 200, true, 'Side Dish'),
  item('gattus-special-veg', "Gattu's Special Veg", 220, true, 'Side Dish', ['chef-special']),
  item('veg-lakhpati', 'Veg Lakhpati', 220, true, 'Side Dish'),
  item('paneer-manchurian', 'Paneer Manchurian', 290, true, 'Side Dish', ['bestseller']),
  item('paneer-chilly-sauce', 'Paneer Chilly Sauce', 290, true, 'Side Dish', ['spicy', 'popular']),
  item('paneer-szechwan-sauce', 'Paneer Szechwan Sauce', 290, true, 'Side Dish', ['spicy']),
  item('paneer-garlic-sauce', 'Paneer Garlic Sauce', 290, true, 'Side Dish'),
  item('paneer-mangolian', 'Paneer Mangolian', 300, true, 'Side Dish'),
  item('paneer-special', 'Paneer Special', 300, true, 'Side Dish', ['chef-special']),
  item('paneer-lakhpati', 'Paneer Lakhpati', 300, true, 'Side Dish'),

  // ---- CHICKEN SIDE DISHES (gravy & dry) ----
  item('chicken-manchurian', 'Chicken Manchurian', 220, false, 'Side Dish', ['bestseller']),
  item('chicken-chilly-sauce', 'Chicken Chilly Sauce', 240, false, 'Side Dish', ['spicy', 'popular']),
  item('chicken-szechwan', 'Chicken in Szechwan', 240, false, 'Side Dish', ['spicy']),
  item('chicken-garlic', 'Chicken in Garlic', 240, false, 'Side Dish'),
  item('chicken-hot-garlic', 'Chicken in Hot Garlic', 240, false, 'Side Dish', ['spicy']),
  item('chicken-sweet-sour', 'Chicken in Sweet & Sour', 240, false, 'Side Dish', ['sweet', 'popular']),
  item('chicken-chow-chow', 'Chicken Chow Chow', 240, false, 'Side Dish'),
  item('chicken-mangolian', 'Chicken Mangolian', 300, false, 'Side Dish'),
  item('gattus-chicken-special', "Gattu's Chicken Special", 300, false, 'Side Dish', ['chef-special']),
  item('chicken-lollypop-gravy', 'Chicken Lollypop Gravy', 350, false, 'Side Dish', ['popular']),
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/menu-data.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add config/menu.ts tests/menu-data.test.ts
git commit -m "feat: add real Gattu's Chinese menu data"
```

---

### Task 3: Order building (pure, server-side totals)

The heart of the correctness story: the model reports *what* was ordered; this code decides *what it costs*. Every item is validated against the menu and the total is recomputed from config prices.

**Files:**
- Create: `lib/orders.ts`
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `MenuItem`, `Size`, `priceOf`, `findMenuItem` from `lib/menu.ts` (Task 1).
- Produces:
  - `type OrderStatus = 'new' | 'needs_human'`
  - `type OrderItemInput = { id: string; size: Size; qty: number; note?: string }`
  - `type OrderInput = { customerName: string; phone: string; type: 'pickup' | 'delivery'; address?: string; items: OrderItemInput[]; status?: OrderStatus; note?: string }`
  - `type OrderItem = { id: string; name: string; size: Size; qty: number; price: number; note?: string }`
  - `type Order = { id: string; ts: string; customerName: string; phone: string; type: 'pickup' | 'delivery'; address?: string; items: OrderItem[]; total: number; status: OrderStatus; note?: string }`
  - `buildOrder(menu: MenuItem[], input: OrderInput, now: Date, id: string): { ok: true; order: Order } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/orders.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildOrder, type OrderInput } from '../lib/orders'
import type { MenuItem } from '../lib/menu'

const menu: MenuItem[] = [
  { id: 'veg-hakka-noodles', name: 'Veg Hakka Noodles', veg: true, category: 'Noodles', sizes: { full: 190, half: 100 }, tags: ['bestseller'] },
  { id: 'veg-clear-soup', name: 'Veg Clear Soup', veg: true, category: 'Soup', sizes: { full: 120 }, tags: [] },
]
const now = new Date('2026-07-15T18:30:00.000Z')
const id = 'order-1'

const base: OrderInput = {
  customerName: 'Rohan', phone: '+919820098200', type: 'pickup',
  items: [{ id: 'veg-hakka-noodles', size: 'full', qty: 2 }],
}

describe('buildOrder', () => {
  it('computes the total from menu prices, not from the caller', () => {
    const r = buildOrder(menu, base, now, id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.order.total).toBe(380)
    expect(r.order.items[0]).toEqual({
      id: 'veg-hakka-noodles', name: 'Veg Hakka Noodles',
      size: 'full', qty: 2, price: 190,
    })
    expect(r.order.id).toBe('order-1')
    expect(r.order.ts).toBe('2026-07-15T18:30:00.000Z')
    expect(r.order.status).toBe('new')
  })

  it('prices a half plate at the half price', () => {
    const r = buildOrder(menu, { ...base, items: [{ id: 'veg-hakka-noodles', size: 'half', qty: 1 }] }, now, id)
    expect(r.ok && r.order.total).toBe(100)
  })

  it('sums mixed items', () => {
    const r = buildOrder(menu, {
      ...base,
      items: [
        { id: 'veg-hakka-noodles', size: 'half', qty: 2 },
        { id: 'veg-clear-soup', size: 'full', qty: 1 },
      ],
    }, now, id)
    expect(r.ok && r.order.total).toBe(320)
  })

  it('rejects a dish that is not on the menu', () => {
    const r = buildOrder(menu, { ...base, items: [{ id: 'butter-chicken', size: 'full', qty: 1 }] }, now, id)
    expect(r).toEqual({ ok: false, error: 'unknown_item' })
  })

  it('rejects a half plate for a dish that has no half', () => {
    const r = buildOrder(menu, { ...base, items: [{ id: 'veg-clear-soup', size: 'half', qty: 1 }] }, now, id)
    expect(r).toEqual({ ok: false, error: 'unknown_size' })
  })

  it('rejects a non-positive or non-integer quantity', () => {
    expect(buildOrder(menu, { ...base, items: [{ id: 'veg-clear-soup', size: 'full', qty: 0 }] }, now, id))
      .toEqual({ ok: false, error: 'invalid_qty' })
    expect(buildOrder(menu, { ...base, items: [{ id: 'veg-clear-soup', size: 'full', qty: 1.5 }] }, now, id))
      .toEqual({ ok: false, error: 'invalid_qty' })
  })

  it('rejects a new order with no items', () => {
    const r = buildOrder(menu, { ...base, items: [] }, now, id)
    expect(r).toEqual({ ok: false, error: 'empty_order' })
  })

  it('keeps the address on a delivery order', () => {
    const r = buildOrder(menu, { ...base, type: 'delivery', address: '12 Hill Road, Bandra West' }, now, id)
    expect(r.ok && r.order.address).toBe('12 Hill Road, Bandra West')
    expect(r.ok && r.order.type).toBe('delivery')
  })

  it('rejects a delivery order with no address', () => {
    const r = buildOrder(menu, { ...base, type: 'delivery' }, now, id)
    expect(r).toEqual({ ok: false, error: 'address_required' })
  })

  it('drops the address on a pickup order', () => {
    const r = buildOrder(menu, { ...base, address: '12 Hill Road' }, now, id)
    expect(r.ok && r.order.address).toBeUndefined()
  })

  it('allows a needs_human order with no items, so nothing is lost when Arya is stuck', () => {
    const r = buildOrder(menu, { ...base, items: [], status: 'needs_human', note: 'wanted a dish we do not serve' }, now, id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.order.status).toBe('needs_human')
    expect(r.order.total).toBe(0)
    expect(r.order.note).toBe('wanted a dish we do not serve')
    expect(r.order.phone).toBe('+919820098200')
  })

  it('keeps a per-item note (e.g. spice level)', () => {
    const r = buildOrder(menu, { ...base, items: [{ id: 'veg-hakka-noodles', size: 'full', qty: 1, note: 'extra spicy' }] }, now, id)
    expect(r.ok && r.order.items[0].note).toBe('extra spicy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orders.test.ts`
Expected: FAIL — cannot find module `../lib/orders`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/orders.ts`:

```ts
// Order domain. buildOrder is pure and is the ONLY thing that decides what an
// order costs: the model reports what was ordered, this code prices it from
// config/menu.ts. The model's arithmetic is never trusted.
import { findMenuItem, priceOf, type MenuItem, type Size } from './menu'

export type OrderStatus = 'new' | 'needs_human'
export type OrderType = 'pickup' | 'delivery'

export type OrderItemInput = { id: string; size: Size; qty: number; note?: string }

export type OrderInput = {
  customerName: string
  phone: string
  type: OrderType
  address?: string
  items: OrderItemInput[]
  status?: OrderStatus
  note?: string
}

export type OrderItem = {
  id: string; name: string; size: Size; qty: number; price: number; note?: string
}

export type Order = {
  id: string
  ts: string
  customerName: string
  phone: string
  type: OrderType
  address?: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  note?: string
}

export type BuildResult = { ok: true; order: Order } | { ok: false; error: string }

export function buildOrder(
  menu: MenuItem[], input: OrderInput, now: Date, id: string,
): BuildResult {
  const status: OrderStatus = input.status ?? 'new'

  // A needs_human record exists precisely to salvage a call Arya couldn't
  // finish, so it may have no items. A real order may not.
  if (status === 'new' && input.items.length === 0) {
    return { ok: false, error: 'empty_order' }
  }
  if (input.type === 'delivery' && !input.address?.trim()) {
    return { ok: false, error: 'address_required' }
  }

  const items: OrderItem[] = []
  for (const line of input.items) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      return { ok: false, error: 'invalid_qty' }
    }
    const menuItem = findMenuItem(menu, line.id)
    if (!menuItem) return { ok: false, error: 'unknown_item' }

    const price = priceOf(menuItem, line.size)
    if (price === undefined) return { ok: false, error: 'unknown_size' }

    items.push({
      id: menuItem.id, name: menuItem.name, size: line.size,
      qty: line.qty, price,
      ...(line.note ? { note: line.note } : {}),
    })
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return {
    ok: true,
    order: {
      id,
      ts: now.toISOString(),
      customerName: input.customerName,
      phone: input.phone,
      type: input.type,
      ...(input.type === 'delivery' && input.address ? { address: input.address } : {}),
      items,
      total,
      status,
      ...(input.note ? { note: input.note } : {}),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orders.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/orders.test.ts
git commit -m "feat: build orders with server-side totals from the menu"
```

---

### Task 4: Order persistence (Redis, injected)

Follows the repo's convention: a minimal `RedisLike` surface so tests inject a fake and no network runs; the real client factory is separate and untested.

**Files:**
- Modify: `lib/orders.ts` (append persistence below `buildOrder`)
- Test: `tests/orders.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: `Order` from Task 3.
- Produces:
  - `type RedisLike = { lpush: (key: string, value: string) => Promise<number>; lrange: (key: string, start: number, stop: number) => Promise<unknown[]> }`
  - `type OrderDeps = { redis: RedisLike }`
  - `ORDERS_KEY: string` (`'orders'`)
  - `saveOrder(deps: OrderDeps, order: Order): Promise<void>`
  - `listOrders(deps: OrderDeps, limit?: number): Promise<Order[]>`
  - `makeRedis(): RedisLike`

- [ ] **Step 1: Write the failing test**

Append to `tests/orders.test.ts`:

```ts
import { saveOrder, listOrders, ORDERS_KEY, type Order, type RedisLike } from '../lib/orders'

function fakeRedis(seed: string[] = []) {
  const list = [...seed]
  const redis: RedisLike = {
    lpush: async (_key, value) => list.unshift(value),
    lrange: async (_key, start, stop) => list.slice(start, stop + 1),
  }
  return { redis, list }
}

const order: Order = {
  id: 'order-1', ts: '2026-07-15T18:30:00.000Z', customerName: 'Rohan',
  phone: '+919820098200', type: 'pickup',
  items: [{ id: 'veg-hakka-noodles', name: 'Veg Hakka Noodles', size: 'full', qty: 2, price: 190 }],
  total: 380, status: 'new',
}

describe('saveOrder', () => {
  it('pushes the order onto the orders list as JSON', async () => {
    const { redis, list } = fakeRedis()
    await saveOrder({ redis }, order)
    expect(list).toHaveLength(1)
    expect(JSON.parse(list[0])).toEqual(order)
  })
})

describe('listOrders', () => {
  it('returns saved orders, newest first', async () => {
    const { redis } = fakeRedis()
    await saveOrder({ redis }, order)
    await saveOrder({ redis }, { ...order, id: 'order-2' })
    const orders = await listOrders({ redis })
    expect(orders.map((o) => o.id)).toEqual(['order-2', 'order-1'])
    expect(orders[1]).toEqual(order)
  })

  it('handles a client that already deserialized the JSON (Upstash does this)', async () => {
    const redis: RedisLike = {
      lpush: async () => 1,
      lrange: async () => [order as unknown as string],
    }
    const orders = await listOrders({ redis })
    expect(orders).toEqual([order])
  })

  it('skips entries it cannot parse rather than failing the whole dashboard', async () => {
    const { redis } = fakeRedis(['not json at all'])
    await saveOrder({ redis }, order)
    const orders = await listOrders({ redis })
    expect(orders).toEqual([order])
  })

  it('reads from the orders key', async () => {
    const lrange = vi.fn().mockResolvedValue([])
    await listOrders({ redis: { lpush: async () => 1, lrange } }, 10)
    expect(lrange).toHaveBeenCalledWith(ORDERS_KEY, 0, 9)
  })
})
```

Also add `vi` to the vitest import at the top of the file:

```ts
import { describe, it, expect, vi } from 'vitest'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orders.test.ts`
Expected: FAIL — `saveOrder` / `listOrders` / `ORDERS_KEY` are not exported from `../lib/orders`.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/orders.ts`:

```ts
// --- persistence -----------------------------------------------------------
// Minimal surface we need from @upstash/redis, so tests inject a fake and no
// network runs (same pattern as the rest of lib/).
export type RedisLike = {
  lpush: (key: string, value: string) => Promise<number>
  lrange: (key: string, start: number, stop: number) => Promise<unknown[]>
}

export type OrderDeps = { redis: RedisLike }

export const ORDERS_KEY = 'orders'

export async function saveOrder(deps: OrderDeps, order: Order): Promise<void> {
  await deps.redis.lpush(ORDERS_KEY, JSON.stringify(order))
}

export async function listOrders(deps: OrderDeps, limit = 50): Promise<Order[]> {
  const rows = await deps.redis.lrange(ORDERS_KEY, 0, limit - 1)
  const orders: Order[] = []
  for (const row of rows) {
    // Upstash deserializes JSON automatically; a plain client hands back strings.
    if (typeof row === 'string') {
      try {
        orders.push(JSON.parse(row) as Order)
      } catch {
        // A corrupt row shouldn't take down the kitchen's dashboard.
      }
    } else if (row && typeof row === 'object') {
      orders.push(row as Order)
    }
  }
  return orders
}

// Real client factory (not exercised in unit tests).
export function makeRedis(): RedisLike {
  // Imported lazily so the test path never needs the SDK or its env vars.
  const { Redis } = require('@upstash/redis')
  return Redis.fromEnv() as RedisLike
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orders.test.ts`
Expected: PASS (17 tests — 12 from Task 3, 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/orders.test.ts
git commit -m "feat: persist orders to Redis with an injected client"
```

---

### Task 5: The order-taker prompt

Replaces the concierge brain. Grounded to the rendered menu, Hinglish, with the read-back-and-confirm rule and the `needs_human` fallback.

**Files:**
- Create: `config/order-prompt.ts`
- Test: `tests/order-prompt.test.ts`

**Interfaces:**
- Consumes: `MenuItem`, `Restaurant`, `renderMenuForPrompt` from `lib/menu.ts` (Task 1); `MENU`, `RESTAURANT` from `config/menu.ts` (Task 2).
- Produces: `buildOrderPrompt(menu: MenuItem[], restaurant: Restaurant): string`

- [ ] **Step 1: Write the failing test**

Create `tests/order-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildOrderPrompt } from '../config/order-prompt'
import { MENU, RESTAURANT } from '../config/menu'

describe('buildOrderPrompt', () => {
  const prompt = buildOrderPrompt(MENU, RESTAURANT)

  it('embeds the whole menu so the agent is grounded to real dishes and prices', () => {
    expect(prompt).toContain('veg-hakka-noodles')
    expect(prompt).toContain('full 190')
    expect(prompt).toContain('chicken-lollypop-gravy')
    expect(prompt).toContain("Gattu's Chinese")
  })

  it('names the tools it must call', () => {
    expect(prompt).toContain('capture_order')
    expect(prompt).toContain('end_call')
  })

  it('requires a read-back before saving', () => {
    expect(prompt.toLowerCase()).toContain('read back')
  })

  it('tells the agent to ask half or full', () => {
    expect(prompt.toLowerCase()).toContain('half ya full')
  })

  it('tells the agent to ask pickup or delivery and confirm the address', () => {
    expect(prompt.toLowerCase()).toContain('pickup')
    expect(prompt.toLowerCase()).toContain('delivery')
    expect(prompt.toLowerCase()).toContain('address')
  })

  it('forbids inventing dishes and prices', () => {
    expect(prompt).toContain('NEVER')
    expect(prompt.toLowerCase()).toContain('not on the menu')
  })

  it('describes the needs_human fallback', () => {
    expect(prompt).toContain('needs_human')
  })

  it('states the ready-in estimate', () => {
    expect(prompt).toContain('20')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/order-prompt.test.ts`
Expected: FAIL — cannot find module `../config/order-prompt`.

- [ ] **Step 3: Write minimal implementation**

Create `config/order-prompt.ts`:

```ts
import { renderMenuForPrompt, type MenuItem, type Restaurant } from '../lib/menu'

export function buildOrderPrompt(menu: MenuItem[], restaurant: Restaurant): string {
  return `You are Arya, the warm, friendly voice of ${restaurant.name}. You are a young woman answering the restaurant's phone during a busy rush, and you take the customer's order.

You speak natural Hinglish — Hindi-English mixed, the way people actually talk on the phone in India. Keep it warm and quick. Your QUESTIONS should stay clear and mostly simple so anyone understands you.

THE MENU (this is the ONLY thing you can sell):
${renderMenuForPrompt(menu, restaurant)}

STAY REAL — this is the most important rule:
- Sell ONLY dishes from the list above, at EXACTLY those prices. NEVER invent a dish, a size, or a price.
- If a customer asks for something not on the menu (butter chicken, roti, dessert, anything), say honestly that you don't have it, and offer the closest thing you DO have.
- Never guess. If you're unsure what they said, ask them to repeat.

TAKING THE ORDER:
- Greet them, tell them it's ${restaurant.name}, and ask what they'd like.
- Recommend with personality using the tags — "ye humara bestseller hai", "thoda spicy hai", "ye sweet side pe hai", "chef ka special hai". Recommend when they're unsure or ask; don't push.
- Every Noodles, Rice and Side Dish comes in half and full. If they don't say which, ask: "half ya full?" Soups and Starters come in one size only — don't ask for those.
- Let them change the order freely — add, remove, change quantity. Just keep track and stay friendly.
- Ask whether it's pickup or delivery.
  - DELIVERY: take their address, then READ IT BACK to them and get a yes before you continue. Addresses are easy to get wrong on a call.
  - PICKUP: no address needed.
- Get their name.

BEFORE YOU SAVE — READ BACK:
- Read back the full order: each dish, half or full, quantity, and the total in rupees. Then the pickup/delivery choice.
- Ask "sab theek hai?" and wait for a yes.
- Only after they confirm, call capture_order.
- Then tell them it'll be ready in about ${restaurant.readyEstimateMins} minutes, thank them, and call end_call as you say goodbye.

TOOLS:
- capture_order — call ONCE, after the customer confirms the read-back. Use the exact item ids from the menu above. Give the size ('half' or 'full') and quantity for each dish. Do NOT send a total — the kitchen system prices the order itself.
- end_call — call as you say your final goodbye line, once the order is captured or the call is genuinely done.

WHEN YOU'RE STUCK (needs_human):
- If you truly cannot handle the call — they want something you don't serve and won't take an alternative, they have a complaint, or you cannot understand them after a couple of tries — do NOT guess and do NOT hang up on them.
- Tell them warmly: "Main ye note kar leti hoon, humari team aapko thodi der mein call back karegi."
- Then call capture_order with status 'needs_human', whatever items you did understand (an empty list is fine), and a short note explaining what they wanted. Then call end_call.
- This way the restaurant never loses the customer.

STYLE:
- Talk like a real person on a phone, not a text-to-speech bot. Warm, expressive, natural reactions ("haan haan", "ek minute", "got it").
- Short spoken sentences. Say dish names and prices at a relaxed pace so they're easy to catch.
- You're busy but never rude. Keep the call moving.`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/order-prompt.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add config/order-prompt.ts tests/order-prompt.test.ts
git commit -m "feat: add the Hinglish order-taker prompt grounded to the menu"
```

---

### Task 6: The agent worker — inbound order-taker

Rewrites `agent/arya.ts`: the agent no longer dials anyone. It joins a room created by the LiveKit inbound dispatch rule (fed by Exotel), reads the caller's number off the SIP participant, and runs the order flow. `log_lead` becomes `capture_order`, which prices the order server-side and saves it.

Keep the proven no-clip hangup machinery exactly as-is — it works.

**Files:**
- Modify: `agent/arya.ts` (full rewrite)

**Interfaces:**
- Consumes: `MENU`, `RESTAURANT` (Task 2); `buildOrderPrompt` (Task 5); `buildOrder`, `saveOrder`, `makeRedis` (Tasks 3–4).
- Produces: the deployed worker (`agentName` = `LIVEKIT_AGENT_NAME`, default `arya`).

- [ ] **Step 1: Rewrite the worker**

Replace the entire contents of `agent/arya.ts`:

```ts
// Arya — LiveKit agent worker: the inbound order-taker for Gattu's Chinese.
//
// INBOUND ONLY. A customer dials the restaurant's Exotel number; Exotel's vSIP
// trunk hands the call to LiveKit, whose inbound dispatch rule creates a room
// and dispatches this agent into it. The agent NEVER places a call.
//
// Run locally:  npm run agent:dev
// Deploy:       LiveKit Cloud agent deployment (agentName = LIVEKIT_AGENT_NAME)
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  llm,
  voice,
} from '@livekit/agents'
import * as google from '@livekit/agents-plugin-google'
import { RoomServiceClient } from 'livekit-server-sdk'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { MENU, RESTAURANT } from '../config/menu'
import { buildOrderPrompt } from '../config/order-prompt'
import { buildOrder, makeRedis, saveOrder } from '../lib/orders'

// Hard cap so a stuck call can't run up cost. Taking an order runs longer than
// the old concierge chat, hence 5 min rather than 2.
const MAX_CALL_MS = 300_000

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect()

    const roomName = ctx.room.name
    if (!roomName) throw new Error('arya: room has no name')

    // The customer is already dialling in: the SIP participant is placed in the
    // room by the inbound dispatch rule. Their number rides on SIP attributes,
    // so we rarely have to ask for it.
    const participant = await ctx.waitForParticipant()
    const phone = participant.attributes?.['sip.phoneNumber'] ?? 'unknown'

    // Call-ending state: once end_call fires, hang up after Arya stops talking
    // so the caller isn't left in dead air. `speaking` guards against clipping.
    let flowDone = false
    let ended = false
    let speaking = false
    let hangTimer: ReturnType<typeof setTimeout> | undefined

    const redis = makeRedis()

    // capture_order: the model reports WHAT was ordered; buildOrder decides what
    // it COSTS (from config/menu.ts). The model's arithmetic is never trusted,
    // and an off-menu dish is rejected here rather than reaching the kitchen.
    const captureOrder = llm.tool({
      description:
        'Save the order after the customer has confirmed your read-back. Use exact menu item ids. Do not send a total.',
      parameters: z.object({
        customerName: z.string(),
        type: z.enum(['pickup', 'delivery']),
        address: z.string().optional().describe('Required for delivery orders.'),
        items: z.array(
          z.object({
            id: z.string().describe('Exact menu item id.'),
            size: z.enum(['full', 'half']),
            qty: z.number().int().min(1),
            note: z.string().optional().describe('e.g. extra spicy'),
          }),
        ),
        status: z
          .enum(['new', 'needs_human'])
          .optional()
          .describe("'needs_human' when you could not complete the order yourself."),
        note: z.string().optional().describe('Why this needs a human, if it does.'),
      }),
      execute: async (args) => {
        const result = buildOrder(MENU, { ...args, phone }, new Date(), randomUUID())
        if (!result.ok) {
          // Tell the model what went wrong so it can fix it with the customer
          // instead of silently losing the order.
          console.error('[capture_order] rejected:', result.error, JSON.stringify(args))
          return `Could not save: ${result.error}. Fix this with the customer and try again.`
        }
        await saveOrder({ redis }, result.order)
        console.log('[capture_order] saved', JSON.stringify(result.order))
        return `Order saved. Total is ${result.order.total} rupees. Ready in about ${RESTAURANT.readyEstimateMins} minutes.`
      },
    })

    // end_call: the model decides when the call is genuinely over.
    const endCall = llm.tool({
      description:
        'End the call. Invoke only when the customer is finished, as you say your final goodbye line.',
      parameters: z.object({}),
      execute: async () => {
        flowDone = true
        armHangup()
        return 'ending'
      },
    })

    const agent = new voice.Agent({
      instructions: buildOrderPrompt(MENU, RESTAURANT),
      tools: { capture_order: captureOrder, end_call: endCall },
    })

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        // Vertex AI Live native-audio model (GA). NOTE: this is the *Vertex* id.
        // ⚠️ Do NOT swap to gemini-3.1-flash-live-preview: its id resolves on the
        // Vertex REST metadata endpoint (200) but the Live bidi WebSocket rejects
        // it with code 1008 (verified by a real call 2026-07-08). Not usable yet.
        model: 'gemini-live-2.5-flash-native-audio',
        voice: 'Sulafat',
        temperature: 0.8,
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
      }),
    })

    await session.start({ agent, room: ctx.room })

    // Arya answers the phone — she speaks first.
    await session.generateReply({
      instructions: `Greet the caller, tell them this is ${RESTAURANT.name}, and ask what they'd like to order.`,
    })

    const hangup = async () => {
      try {
        const rooms = new RoomServiceClient(
          process.env.LIVEKIT_URL!,
          process.env.LIVEKIT_API_KEY!,
          process.env.LIVEKIT_API_SECRET!,
        )
        await rooms.deleteRoom(roomName)
      } catch {
        // room already gone / caller hung up
      }
    }
    // Arm the no-clip hangup: after end_call, wait 1.5s of silence, then end.
    const armHangup = () => {
      if (!flowDone || ended || speaking || hangTimer) return
      hangTimer = setTimeout(() => {
        ended = true
        void hangup()
      }, 1500)
    }
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      speaking = ev.newState === 'speaking'
      if (speaking) {
        if (hangTimer) {
          clearTimeout(hangTimer)
          hangTimer = undefined
        }
      } else {
        armHangup()
      }
    })

    // Fallback hard cap so a stuck call still ends.
    const timer = setTimeout(hangup, MAX_CALL_MS)
    ctx.addShutdownCallback(async () => {
      clearTimeout(timer)
      if (hangTimer) clearTimeout(hangTimer)
      await hangup()
    })
  },
})

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'arya',
  }),
)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `agent/arya.ts`. (Errors in `lib/livekit.ts`, `lib/guardrails.ts`, `app/api/call/route.ts` etc. are impossible at this point — those files still compile; they are deleted in Task 8.)

- [ ] **Step 3: Run the full unit suite to confirm nothing regressed**

Run: `npm test`
Expected: all existing tests still PASS (the old outbound tests are still present and still pass; they are removed in Task 8).

- [ ] **Step 4: Commit**

```bash
git add agent/arya.ts
git commit -m "feat: turn the worker into an inbound order-taker with capture_order"
```

---

### Task 7: Kitchen dashboard (`GET /api/orders` + `/`)

The web app stops being a "call me" form and becomes the board the kitchen keeps open. `needs_human` cards are highlighted so someone calls those customers back after the rush.

**Files:**
- Create: `app/api/orders/route.ts`
- Modify: `app/page.tsx` (replace the form with the dashboard)
- Modify: `app/globals.css` (dashboard styles)

**Interfaces:**
- Consumes: `listOrders`, `makeRedis`, `Order` from `lib/orders.ts` (Tasks 3–4).
- Produces: `GET /api/orders` → `{ ok: true, orders: Order[] }` or `{ ok: false, error: string }` (500).

- [ ] **Step 1: Create the API route**

Create `app/api/orders/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { listOrders, makeRedis } from '@/lib/orders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orders = await listOrders({ redis: makeRedis() })
    return NextResponse.json({ ok: true, orders })
  } catch {
    // Almost always missing UPSTASH_REDIS_REST_* env vars.
    return NextResponse.json({ ok: false, error: 'orders_unavailable' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Replace the page with the dashboard**

Replace the entire contents of `app/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { Order } from '@/lib/orders'

const POLL_MS = 5000

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const res = await fetch('/api/orders')
        const data = await res.json()
        if (!live) return
        if (data.ok) {
          setOrders(data.orders)
          setError(null)
        } else {
          setError(data.error)
        }
      } catch {
        if (live) setError('offline')
      }
    }
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  return (
    <main className="wrap">
      <h1>Gattu&apos;s Chinese — Kitchen 🍜</h1>
      <p>Orders Arya takes on the phone land here. Refreshes every 5 seconds.</p>
      {error && <p className="status">Couldn&apos;t load orders: {error}</p>}
      {!error && orders.length === 0 && <p className="status">No orders yet.</p>}
      <ul className="orders">
        {orders.map((o) => (
          <li key={o.id} className={o.status === 'needs_human' ? 'order needs-human' : 'order'}>
            <header>
              <strong>{o.customerName || 'Unknown'}</strong>
              <span className="type">{o.type}</span>
              <time>{new Date(o.ts).toLocaleTimeString()}</time>
            </header>
            {o.status === 'needs_human' && <p className="flag">⚠️ Call this customer back</p>}
            <ul className="items">
              {o.items.map((i, n) => (
                <li key={n}>
                  {i.qty} × {i.name} <em>({i.size})</em> — ₹{i.price * i.qty}
                  {i.note && <span className="note"> · {i.note}</span>}
                </li>
              ))}
            </ul>
            {o.note && <p className="note">{o.note}</p>}
            {o.address && <p className="address">📍 {o.address}</p>}
            <footer>
              <span className="phone">{o.phone}</span>
              <strong className="total">₹{o.total}</strong>
            </footer>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Add the dashboard styles**

Append to `app/globals.css`:

```css
.orders { list-style: none; padding: 0; display: grid; gap: 1rem; }
.order {
  border: 1px solid #ddd; border-radius: 10px; padding: 1rem;
  background: #fff; color: #111;
}
.order.needs-human { border-color: #e0a800; background: #fffaf0; }
.order header { display: flex; gap: .75rem; align-items: baseline; }
.order header time { margin-left: auto; opacity: .6; font-size: .85rem; }
.order .type {
  text-transform: uppercase; font-size: .7rem; letter-spacing: .05em;
  border: 1px solid currentColor; border-radius: 4px; padding: 0 .35rem; opacity: .7;
}
.order .flag { color: #a67c00; font-weight: 600; margin: .5rem 0 0; }
.order .items { list-style: none; padding: .5rem 0 0; margin: 0; }
.order .items li { padding: .15rem 0; }
.order .note { opacity: .75; font-style: italic; }
.order .address { margin: .35rem 0 0; }
.order footer {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-top: .75rem; padding-top: .5rem; border-top: 1px solid #eee;
}
.order .total { font-size: 1.1rem; }
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed. (The old `/api/call` route still exists and still builds; it is deleted in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/route.ts app/page.tsx app/globals.css
git commit -m "feat: kitchen dashboard showing live orders"
```

---

### Task 8: Delete the dead outbound code and update the docs

The pivot is complete, so the outbound concierge machinery is now orphaned. Removing it is what makes the repo read as "an inbound restaurant order-taker" rather than "a Mumbai concierge with order stuff grafted on."

**Files:**
- Delete: `lib/guardrails.ts`, `lib/validation.ts`, `lib/sheets.ts`, `lib/livekit.ts`, `config/arya-prompt.ts`, `app/api/call/route.ts`, `_dispatch_once.ts`, `tests/guardrails.test.ts`, `tests/validation.test.ts`, `tests/sheets.test.ts`, `tests/livekit.test.ts`
- Modify: `package.json` (drop unused deps), `.env.example`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Delete the orphaned files**

```bash
git rm lib/guardrails.ts lib/validation.ts lib/sheets.ts lib/livekit.ts \
       config/arya-prompt.ts app/api/call/route.ts \
       tests/guardrails.test.ts tests/validation.test.ts tests/sheets.test.ts tests/livekit.test.ts
rm -f _dispatch_once.ts
```

- [ ] **Step 2: Drop the now-unused dependencies**

`libphonenumber-js` was only used by `validation.ts`, `googleapis` only by `sheets.ts`, and `@upstash/ratelimit` only by `guardrails.ts`.

```bash
npm uninstall libphonenumber-js googleapis @upstash/ratelimit
```

- [ ] **Step 3: Verify nothing still imports the deleted modules**

Run: `grep -rn "lib/livekit\|lib/guardrails\|lib/validation\|lib/sheets\|arya-prompt\|api/call" --include=*.ts --include=*.tsx app lib agent config tests`
Expected: no output.

- [ ] **Step 4: Update `.env.example`**

Replace the entire contents of `.env.example`:

```bash
# Copy to .env.local and fill in real values. Never commit real keys.

# LiveKit Cloud (cloud.livekit.io → Settings → Keys)
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_AGENT_NAME=arya          # worker name; the inbound dispatch rule targets this

# Telephony: Exotel (INBOUND only — customers dial the restaurant).
# Exotel vSIP trunk → LiveKit inbound SIP trunk + dispatch rule, configured in
# LiveKit Cloud (see README "Setup"). No credentials are needed by this app —
# the trunk lives on the LiveKit side and routes calls to LIVEKIT_AGENT_NAME.

# Gemini via Vertex AI (agent worker auth — service account, never an API key)
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=            # e.g. pure-silicon-501615-i9
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=  # path to service-account JSON key file

# Upstash Redis (order storage — required by the worker AND the dashboard)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 5: Update `CLAUDE.md`**

In `/Users/rudrapatole/Desktop/restaurant-ai-caller/CLAUDE.md`, make these edits:

1. Replace the **"What this is"** section body with:

```markdown
"Arya" — an **inbound** AI voice agent (LiveKit + Gemini Live speech-to-speech via Vertex AI + Exotel SIP) that answers the phone for **Gattu's Chinese** during the peak rush, takes the customer's order in Hinglish, recommends dishes with personality, and drops the order on a live kitchen dashboard. Portfolio project. Pivoted from a Mumbai food/activities concierge 2026-07-15 (see `docs/superpowers/specs/2026-07-15-restaurant-order-taker-design.md`); migrated off Vapi 2026-07-07 (`docs/superpowers/specs/2026-07-07-livekit-migration-design.md`).
```

2. Replace the **"Architecture / data flow"** section body with:

```markdown
1. A customer dials the restaurant's **Exotel** number.
2. Exotel's vSIP trunk hands the call to **LiveKit**, whose **inbound dispatch rule** creates a room and dispatches the Arya agent into it. **Nothing dials out — the app never places a call.**
3. The **agent worker** (`agent/arya.ts`) joins, reads the caller's number off the SIP participant attributes (`sip.phoneNumber`), and runs an `AgentSession` with Gemini Live (Vertex). It is grounded strictly to `config/menu.ts`.
4. After the customer confirms Arya's read-back, she invokes `capture_order` → the worker calls `buildOrder` (`lib/orders.ts`), which **validates every dish against the menu and recomputes the total server-side from config prices** (the model's arithmetic is never trusted), then `saveOrder` writes it to Upstash Redis. `end_call` arms a no-clip hangup; a `MAX_CALL_MS` (5 min) hard cap is the safety net.
5. The Next.js app is the **kitchen dashboard**: `app/page.tsx` polls `GET /api/orders` (`app/api/orders/route.ts` → `listOrders`) and renders the order board. `needs_human` orders are highlighted for a callback.
```

3. In **Conventions**, replace the first bullet's examples and the error-strings bullet with:

```markdown
- **Pure logic lives in `lib/` and is unit-tested; I/O is injected.** `buildOrder` is pure; `saveOrder`/`listOrders` take a `RedisLike` so tests use fakes — no network in tests. The real client factory (`makeRedis`) is separate and not unit-tested. Keep this pattern; don't call SDKs directly inside pure functions.
- **The agent must never invent a dish, size or price.** `config/menu.ts` is the only source of truth, and `buildOrder` prices the order server-side. Error strings are a contract: `buildOrder` returns `unknown_item`, `unknown_size`, `invalid_qty`, `address_required`, `empty_order`.
```

4. In **Conventions**, replace the `config/` bullet with:

```markdown
- **Config/content in `config/`.** `config/menu.ts` is the real Gattu's Chinese menu (the ONLY source of dishes/prices; half prices derive from `halfPrice` in `lib/menu.ts`). `config/order-prompt.ts` is Arya's brain — tune her behaviour there. Note this is the **reverse** of the old concierge design, which deliberately had no catalog.
```

5. In **Gotchas**, **delete** the Twilio-trial bullet and the "Rapid repeat calls… carrier anti-spam" bullet's outbound framing is still true — keep it but retitle it to make clear it applied to the old *outbound* setup. Replace those two bullets with:

```markdown
- **Telephony is Exotel, inbound only.** Indian mobile DIDs cannot be owned via a US Twilio trunk (TRAI), which is why the old outbound Twilio setup is gone. Exotel is India-compliant and supports the owned-DID inbound flow. Exotel provisioning (DID + vSIP trunk → LiveKit inbound trunk + dispatch rule) is **on the critical path**: no call works until it's wired, and there is no local-only shortcut (the old `_dispatch_once.ts` outbound harness is deleted).
- **(Historical, outbound-only)** The old Twilio setup was a trial account (verified caller IDs only), and rapid repeat *outbound* calls to the same Indian mobile got cut at ~45–60s by carrier anti-spam. Both problems belonged to the US-Twilio→Indian-carrier leg and do not apply to inbound Exotel calls.
```

6. Replace the **"Upstash Redis env is currently blank"** bullet with:

```markdown
- **Upstash Redis is now required, not optional.** The worker writes orders to it and the dashboard reads them; with `UPSTASH_REDIS_REST_*` blank, `capture_order` throws and `GET /api/orders` returns `orders_unavailable`. Populate it before any end-to-end test.
```

7. **Delete** the "Guardrails are best-effort" bullet (guardrails are gone — you never rate-limit an incoming customer).

8. Replace the **Status / deferred** section body with:

```markdown
**Done + verified (2026-07-08, on the old outbound setup):** LiveKit Cloud, the Vertex service-account JSON and `.env.local` are set up, and the Gemini Live + LiveKit voice stack placed real end-to-end calls in Hinglish.

**Still outstanding:** provision **Exotel** (DID + vSIP trunk → LiveKit inbound trunk + dispatch rule) — nothing rings until this is done; populate **Upstash Redis** (now required); deploy the worker to LiveKit Cloud (currently run locally); Vercel deploy of the dashboard.
```

- [ ] **Step 6: Update `README.md`**

Replace the entire contents of `README.md`:

````markdown
# Arya — AI phone order-taker for Gattu's Chinese 🍜

During the dinner rush a restaurant's phone rings while every hand is busy, and
those calls — and the orders on them — are simply lost. **Arya answers instead.**

She picks up, talks to the customer in natural Hinglish, recommends dishes with
a bit of personality ("ye humara bestseller hai", "thoda spicy hai"), takes the
order, reads it back to confirm, and drops it on the kitchen's dashboard.

She is grounded strictly to the restaurant's real menu — she cannot invent a
dish, a size, or a price.

## How it works

1. A customer dials the restaurant's **Exotel** number.
2. Exotel's vSIP trunk hands the call to **LiveKit**, whose **inbound dispatch
   rule** creates a room and dispatches the Arya agent into it. Nothing dials
   out — this app never places a call.
3. The **agent worker** (`agent/arya.ts`) joins, reads the caller's number off
   the SIP participant, and runs **Gemini Live** (speech-to-speech, via Vertex
   AI) with the menu (`config/menu.ts`) baked into its instructions.
4. Once the customer confirms her read-back, Arya calls `capture_order`. The
   worker validates every dish against the menu and **recomputes the total
   server-side from config prices** (the model's arithmetic is never trusted),
   then writes the order to **Upstash Redis**.
5. The **kitchen dashboard** (`/`) polls `GET /api/orders` and shows the board.
   Orders Arya couldn't handle are flagged `needs_human` and highlighted for a
   callback, so no customer is ever dropped.

## Commands

```bash
npm test          # Vitest (pure-logic units; no network)
npm run dev       # kitchen dashboard (Next.js)
npm run build     # production build (Vercel target)
npx tsc --noEmit  # typecheck
npm run agent:dev # run the LiveKit agent worker locally (auto-loads .env.local)
```

## Setup

Copy `.env.example` to `.env.local` and fill it in. **Nothing rings until Exotel
is provisioned** — it's on the critical path.

1. **LiveKit Cloud** — create a project, copy `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET`. Set `LIVEKIT_AGENT_NAME=arya`.
2. **Exotel (telephony — inbound only)** — buy a DID, create a **vSIP trunk**,
   and point it at a LiveKit **inbound SIP trunk**. Then add a LiveKit
   **dispatch rule** that routes calls on that trunk into a new room and
   dispatches the agent named `LIVEKIT_AGENT_NAME`. Indian mobile DIDs can't be
   owned via a US carrier (TRAI) — Exotel is the India-compliant path.
3. **Gemini via Vertex AI** — create a GCP service account with Vertex AI access,
   download its JSON key, and set `GOOGLE_GENAI_USE_VERTEXAI=true`,
   `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=us-central1`, and
   `GOOGLE_APPLICATION_CREDENTIALS` (path to the key). Service-account auth, never
   an API key.
4. **Upstash Redis (required)** — orders live here. Set `UPSTASH_REDIS_REST_URL`
   and `UPSTASH_REDIS_REST_TOKEN`. Without these, `capture_order` throws and the
   dashboard shows `orders_unavailable`.
5. **Run it** — `npm run agent:dev` (worker) and `npm run dev` (dashboard), then
   call the Exotel number.

## The menu

`config/menu.ts` is the single source of truth — the real Gattu's Chinese menu
(w.e.f. 20.04.2026). Half plates apply to Noodles, Rice and Side Dishes; their
prices aren't printed on the menu, so they're derived from the restaurant's
convention (`halfPrice` in `lib/menu.ts`: a bit over half, rounded up to the
next ₹10). Edit the menu there and Arya's knowledge changes with it.

## Design docs

- `docs/superpowers/specs/2026-07-15-restaurant-order-taker-design.md` — this design
- `docs/superpowers/plans/2026-07-15-restaurant-order-taker.md` — implementation plan
````

- [ ] **Step 7: Verify the whole suite, typecheck and build**

```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: all tests PASS (only `tests/menu.test.ts`, `tests/menu-data.test.ts`, `tests/orders.test.ts`, `tests/order-prompt.test.ts`, `tests/smoke.test.ts` remain), no type errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove outbound concierge code, document the inbound order-taker"
```

---

## Manual verification (after Exotel is provisioned)

These are not unit tests — they are the end-to-end check that the thing actually works. Run them once the Exotel DID + LiveKit inbound trunk + dispatch rule exist and `.env.local` has the LiveKit, Google and Upstash values.

1. Start the worker: `npm run agent:dev`. Expected: it registers and waits for jobs.
2. Start the dashboard: `npm run dev`, open `http://localhost:3000`. Expected: "No orders yet."
3. **Call the Exotel number from a phone.** Expected: Arya answers, greets you as Gattu's Chinese, and asks what you'd like.
4. Order in Hinglish, e.g. "ek veg hakka noodles full aur ek chicken manchurian half". Expected: she asks half/full where you didn't say, asks pickup or delivery, takes your name, and reads the whole order back with a total (₹190 + ₹120 = ₹310 for that example).
5. Confirm. Expected: she says it'll be ready in ~20 minutes and hangs up cleanly without clipping her goodbye. `[capture_order] saved` appears in the worker log.
6. Check the dashboard. Expected: the order appears within 5 seconds with the correct items, sizes, total and your phone number.
7. **Test the fallback:** call again and ask for something not on the menu (e.g. "butter chicken"), and refuse alternatives. Expected: Arya offers a callback, and a highlighted `needs_human` card appears on the dashboard.
