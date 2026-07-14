# Restaurant Order-Taker — Design Spec

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Supersedes the use-case of:** the Mumbai food/activities concierge (same LiveKit + Gemini Live + Vertex backbone, new brain and telephony direction).

## Problem

During peak hours a restaurant's staff are busy on other calls or serving in person, so incoming order calls go unanswered and orders are lost. An inbound AI voice agent ("Arya") answers those calls, takes the order conversationally in Hinglish, recommends dishes with personality, and drops a structured order onto a live kitchen dashboard so the restaurant can cook it. This is a portfolio piece for one real restaurant (Gattu's Chinese).

## What stays vs. what changes

**Stays (proven backbone):** LiveKit + Gemini Live speech-to-speech (Vertex AI, `gemini-live-2.5-flash-native-audio`, voice `Sulafat`); the no-clip hangup + `MAX_CALL_MS` safety machinery; the "pure logic in `lib/`, I/O injected, unit-tested with fakes" pattern; the Next.js app shell; Upstash Redis as the datastore.

**Changes:** outbound dial-out → **inbound accept**; Mumbai-concierge brain → **menu-grounded order-taker**; `log_lead` → `capture_order`; console/Sheets logging → **Redis + `/orders` kitchen dashboard**; the "place a call" web form → the **kitchen order board**. Twilio is dropped entirely.

## Telephony — inbound via Exotel (Twilio dropped)

Customer dials the restaurant's Exotel DID → **Exotel vSIP → LiveKit inbound SIP trunk** → a LiveKit **dispatch rule** routes the incoming call to the agent worker, creating a room per call. The agent **joins and greets** — there is no outbound dial. Caller phone number comes from the **SIP participant attributes** (caller ID), so it rarely needs to be asked.

- Twilio is removed. All `TWILIO_*` / `LIVEKIT_OUTBOUND_TRUNK_ID` config is replaced by Exotel inbound trunk + dispatch-rule config.
- Exotel provisioning (India-compliant DID, vSIP → LiveKit inbound trunk, dispatch rule) is **on the critical path** — no call works until it is wired. There is no local-only shortcut (the old outbound `_dispatch_once.ts` harness is gone).
- Rationale for Exotel: Indian inbound DIDs cannot be owned via a US Twilio trunk (TRAI); Exotel is India-compliant and supports the owned-DID inbound flow this product requires. This is also a stronger portfolio story than the old Twilio-trial ("verified caller IDs only") setup — genuinely inbound.

## Menu — `config/menu.ts` (source of truth)

The real Gattu's Chinese menu, structured. Each dish is **one item with a `sizes` field** (half/full is universal on this menu, so separate-item-per-size would double the list and bloat the agent's grounding context):

```ts
type MenuItem = {
  id: string
  name: string
  sizes: { full: number; half?: number }     // INR; half omitted only if a dish has no half
  veg: boolean
  category: string                            // Soup | Starter | Noodles | Rice | Side Dish (Gravy/Dry)
  tags: ('bestseller' | 'popular' | 'spicy' | 'sweet' | 'chef-special')[]
  desc?: string                               // one spoken line
}
export const RESTAURANT = { name: "Gattu's Chinese", readyEstimateMins: 20 /* owner-tuned */, phone: '...' }
export const MENU: MenuItem[]
```

- **Half prices** are not printed on the menu; they follow the restaurant's rough "a bit over half, rounded to 10s" convention (e.g. full 280 → half 150, full 300 → half 160, full 270 → half 140). Concrete half prices are **baked into config** from that rule as the starting point; the owner eyeballs and corrects. `buildOrder` reads the concrete number — it never re-derives or trusts a live formula.
- **Veg vs non-veg:** the Chicken/Egg columns are non-veg; everything else is veg.
- **Tags** are not on the menu, so they are **inferred** (Szechwan / Hot Garlic / Chilly → spicy; Sweet & Sour → sweet; Manchurian / Hakka / Fried Rice → bestseller/popular) and corrected by the owner.
- The single add-on ("Extra Szechuan & Fry Noodles ₹20") rides as an optional free-text note, not a priced modifier.
- A helper renders `MENU` into the prompt so the agent is **strictly grounded** — it recommends via `tags`, quotes only these exact prices, and never invents a dish or price. (Deliberate reversal of the old "pure agent, no catalog" rule.)

## The brain — `config/order-prompt.ts`

Warm Hinglish host, name kept as **"Arya"** (low churn). Flow:

1. Greet.
2. Take the order conversationally; recommend using menu tags ("ye humara bestseller hai", "thoda spicy hai").
3. When size is unspecified, ask "half ya full?".
4. Ask **pickup or delivery**. For delivery, capture the address and **read it back** to confirm.
5. **Read back the full order + total + ready-in estimate** to confirm before saving.
6. Call `capture_order`, then `end_call`.

- **Order editing is conversational only** — the in-progress order lives in the model's dialogue context. There are no `add_item`/`remove_item` tools and no partial-order state in the worker. Exactly one `capture_order` call happens, at the end, after confirmation.
- **If the call drops before confirmation, nothing is saved** (an unconfirmed order is genuinely incomplete; better than saving a half-built one).
- **Fallback when Arya can't handle it** (off-menu request, complaint, repeated non-understanding): no live transfer (there is no free human — that is the premise). Arya says she'll have the team call back, and `capture_order` records whatever she understood plus the phone number with `status: 'needs_human'`. That card is highlighted on the dashboard for a post-rush callback.
- `MAX_CALL_MS` raised from 2 min → ~5 min (ordering runs longer than a quick recommendation).

## Order data — `lib/orders.ts` (injected-deps, unit-tested)

- `buildOrder(input, now)` — **pure**. Validates each item + chosen size exists in `MENU`; **recomputes the total server-side from config prices** (`price(size) × qty`), never trusting the model's arithmetic. Produces:
  ```ts
  type Order = {
    id: string            // UUID, internal
    ts: string            // ISO
    customerName: string
    phone: string         // from caller ID
    type: 'pickup' | 'delivery'
    address?: string      // freeform, delivery only
    items: { id: string; name: string; size: 'full' | 'half'; qty: number; price: number; note?: string }[]
    total: number
    status: 'new' | 'needs_human'
  }
  ```
- `saveOrder({ redis }, order)` / `listOrders({ redis })` — thin Redis I/O (a single global orders list; demo scale).
- The `capture_order` tool in the worker calls `buildOrder` → `saveOrder`.

## Web app — kitchen dashboard

- Home page (`/`) becomes the **live orders board**: cards showing items (with size + qty), total, pickup/delivery + address, name, phone, time, status. `needs_human` cards are highlighted.
- `GET /api/orders` reads from Redis (replaces `/api/call`).
- Auto-refresh via polling ("real-time enough").

## Cleanup (dead outbound code removed)

Deliberate pivot, so orphaned outbound-specific code is removed for a clean repo: `lib/guardrails.ts` (rate-limiting incoming customers is counterproductive), `lib/validation.ts` (form phone heuristic — caller ID now comes from SIP), `lib/sheets.ts` (parked, replaced by Redis orders), `app/api/call`, the old `config/arya-prompt.ts`, the call form in `app/page.tsx`, and the outbound dial path in the agent. The LiveKit/Gemini/hangup machinery and the pure-logic-injected-deps pattern are kept.

## Testing / success criteria

- `npm test` green: `buildOrder` rejects off-menu items, computes the total from config prices (not the LLM), handles pickup vs delivery and half vs full, and produces `needs_human` records.
- `npx tsc --noEmit` clean.
- Manual: a real inbound call to the Exotel DID takes an order end-to-end in Hinglish and it appears on the dashboard.

## Out of scope (v1)

Runtime item availability / sold-out toggles; short human-friendly order numbers; dashboard status transitions beyond `new`/`needs_human`; priced modifiers / add-ons / spice-level pricing; dine-in reservations; multi-restaurant support; payment handling; call-recording consent flow.
