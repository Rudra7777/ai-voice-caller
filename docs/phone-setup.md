# Phone setup — LiveKit Phone Numbers (the easy path)

Making the phone ring Arya, using **LiveKit Phone Numbers** — a first-party US
number bought inside the LiveKit console. No second vendor, no SIP trunk, no
credentials to match, no KYC.

```
customer's phone → LiveKit US number → dispatch rule → agent "arya"
```

> **Why this instead of Exotel?** A real *Indian* DID requires business KYC
> (COI/PAN/GST) from any provider — that's TRAI regulation, not a vendor quirk —
> and can take days. A portfolio demo doesn't need an Indian number; it needs to
> show Arya answering and taking an order. This gets you there in minutes. The
> Indian-number path stays documented in [`exotel-setup.md`](./exotel-setup.md)
> for a real restaurant deployment later.
>
> **No code changes either way.** The agent is telephony-agnostic; the dispatch
> rule targets agent `arya` regardless of who provides the number.

Sources: [LiveKit Phone Numbers docs](https://docs.livekit.io/telephony/start/phone-numbers/),
[dispatch rules](https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/).

---

## Prerequisites

- [ ] A **LiveKit Cloud** project (you have this) with `LIVEKIT_URL`,
      `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env.local`.
- [ ] **Upstash Redis** populated (`UPSTASH_REDIS_REST_URL` / `_TOKEN`) — orders
      are written to it, and the dashboard reads from it. The call will connect
      without this, but `capture_order` throws the moment Arya tries to save.
- [ ] The **Vertex** env set (`GOOGLE_APPLICATION_CREDENTIALS` path,
      `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=us-central1`).

That's it — no new env vars, no `lk` CLI required (though it works too).

---

## Step 1 — Run the worker

The agent must be running and registered with LiveKit Cloud, or there's nothing
to dispatch the call to. Running it locally is fine for the demo — the worker
connects *out* to LiveKit Cloud and receives dispatches (this is exactly how the
old outbound calls worked).

```bash
npm run agent:dev
```

Leave it running. You should see it register as agent `arya`.

## Step 2 — Buy a number

In the **LiveKit Cloud console**:

1. **Telephony → Phone Numbers → Buy a number**
2. Search by area code (any US area code is fine for a demo).
3. Click **Rent** on a number → **Confirm rental**.

Every LiveKit plan includes one free US local number with free inbound minutes.

## Step 3 — Point the number at Arya

Right after purchase, click **Options → Assign / create dispatch rule** on the
number (or find the number later under **Telephony → Phone Numbers**).

Create a dispatch rule that:
- creates a **new room per caller** (individual dispatch), and
- dispatches the agent named **`arya`**.

> `arya` must match `LIVEKIT_AGENT_NAME` in `.env.local` (default `arya`, set in
> `agent/arya.ts`'s `ServerOptions`). If they don't match, the call connects to
> silence — the room opens and no agent joins.

If you'd rather do it from the CLI, the rule JSON is identical to the one in
[`exotel-setup.md`](./exotel-setup.md) Phase 1 Step 3 (`lk sip dispatch create`).

## Step 4 — Start the dashboard

```bash
npm run dev      # http://localhost:3000
```

## Step 5 — Call it

Dial the number you just bought (from any phone — it's a US number, so calling
from India is a normal international call).

Expected:
1. Arya answers and greets you as Gattu's Chinese.
2. Order in Hinglish: *"ek veg hakka noodles full aur ek chicken manchurian half"*
   → she reads back **₹190 + ₹120 = ₹310**, asks pickup or delivery, takes your name.
3. Confirm → `[capture_order] saved` in the worker log → the order appears on the
   dashboard within 5 seconds.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Rings, then silence; room opens with no agent | Worker not running, or the dispatch rule's agent name ≠ `arya` |
| Arya answers but `capture_order` fails | Upstash Redis env vars are blank |
| Arya joins but is deaf/mute | Vertex env wrong (`GOOGLE_APPLICATION_CREDENTIALS` path, `GOOGLE_CLOUD_LOCATION=us-central1`) |
| Can't find "Buy a number" | Telephony may need enabling on the project (Project Settings → Telephony) |

---

## Limitations (fine for a demo, know them anyway)

- **US numbers only** right now — international (incl. India) is on LiveKit's
  roadmap but not available yet. For a real Indian restaurant, use Exotel.
- **Inbound only** — which is exactly what this project needs.
