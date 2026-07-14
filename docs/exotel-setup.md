# Exotel → LiveKit inbound setup

The runbook for making the restaurant's phone number actually ring Arya.
Nothing in this project places a call — a customer dials an **Exotel DID**,
Exotel forwards the call over SIP to **LiveKit**, and LiveKit's **dispatch rule**
drops the `arya` agent into a fresh room.

```
customer's phone → Exotel DID → Exotel vSIP trunk
                                    ↓ SIP/TLS
                    <subdomain>.india.sip.livekit.cloud:5061
                                    ↓
                 LiveKit inbound trunk → dispatch rule → agent "arya"
```

Sources: [Exotel × LiveKit guide](https://docs.exotel.com/dynamic-sip-trunking/connect-exotel-sip-trunk-to-livekit),
[LiveKit inbound trunks](https://docs.livekit.io/sip/trunk-inbound/),
[LiveKit dispatch rules](https://docs.livekit.io/sip/dispatch-rule/).

---

## Phase 0 — Prerequisites (do these first; they gate everything)

- [ ] **Exotel account with KYC completed.** India telecom is regulated — KYC is a
      real approval step with a lead time, not a checkbox. Start it early.
- [ ] **An Exotel DID** (the number customers will dial), in **E.164** format
      (`+9122XXXXXXXX`).
- [ ] **Exotel API credentials** (`account_sid`, API key/token) for the v2 API.
- [ ] **LiveKit Cloud project with Telephony enabled.**
- [ ] **`lk` CLI installed and authenticated:**
      ```bash
      brew install livekit-cli     # macOS
      lk cloud auth               # links the CLI to your LiveKit project
      ```

Pick a **shared SIP username/password** now (e.g. `gattus-sip` / a long random
string). You will enter the *same* pair on both sides — that's the digest auth
that lets LiveKit trust the call. Keep it in `.env.local` notes, not in git.

---

## Phase 1 — LiveKit side

### 1. Get your SIP URI

LiveKit Console → **Project Settings → Telephony → SIP Trunks**, copy the SIP URI.
Use the **India region** endpoint for latency:

```
<your-subdomain>.india.sip.livekit.cloud
```

### 2. Create the inbound trunk

`inbound-trunk.json` (fill in your DID and the credentials you picked):

```json
{
  "trunk": {
    "name": "Gattu's Chinese — Exotel inbound",
    "numbers": ["+9122XXXXXXXX"],
    "auth_username": "gattus-sip",
    "auth_password": "<the-long-random-string>",
    "krispEnabled": true
  }
}
```

```bash
lk sip inbound create inbound-trunk.json
```

> `numbers` is the DID Exotel will deliver the call *to*. An empty array accepts
> any number, but pin it to your DID.
> Prefer **digest auth** (above) over IP allowlisting — Exotel doesn't support
> CIDR ranges, only `/32` per-IP entries, which is brittle.

### 3. Create the dispatch rule

This is what actually puts Arya on the call. `dispatch-rule.json`:

```json
{
  "dispatch_rule": {
    "name": "Gattu's inbound → Arya",
    "rule": {
      "dispatchRuleIndividual": {
        "roomPrefix": "call-"
      }
    },
    "roomConfig": {
      "agents": [
        { "agentName": "arya" }
      ]
    }
  }
}
```

```bash
lk sip dispatch create dispatch-rule.json
```

`dispatchRuleIndividual` gives **one room per caller** (correct here — orders are
private). `agentName` **must equal** `LIVEKIT_AGENT_NAME` in `.env.local`
(default `arya`, set in `agent/arya.ts`'s `ServerOptions`). If these don't match,
the call connects to silence — the room opens and no agent ever joins.

---

## Phase 2 — Exotel side (v2 API)

Base: `https://api.exotel.com/v2/accounts/{account_sid}`

### 1. Create the SIP trunk

Create the trunk in the Exotel dashboard (Dynamic SIP Trunking) or via API, and
**note the returned `trunk_sid`** — you need it in step 4.

### 2. Map your DID to the trunk

Associate the E.164 DID with the trunk you just created.

### 3. Add the SIP credentials

The **same** username/password you put in the LiveKit inbound trunk:

```http
POST /v2/accounts/{account_sid}/trunks/{trunk_sid}/credentials
{
  "user_name": "gattus-sip",
  "password": "<the-long-random-string>",
  "friendly_name": "livekit"
}
```

### 4. Point the trunk at LiveKit

```http
POST /v2/accounts/{account_sid}/trunks/{trunk_sid}/destination_uris
{
  "destinations": [
    { "destination": "<your-subdomain>.india.sip.livekit.cloud:5061;transport=tls" }
  ]
}
```

Port **5061 + `transport=tls`** matters — plain UDP/5060 will not be accepted.

### 5. Configure the inbound flow (applet)

Map the DID to a flow whose dial target is the **trunk SID**, not the full URI:

```
sip:<trunk_sid>
```

This is the step people get wrong — pasting the LiveKit FQDN here instead of the
trunk SID silently fails.

---

## Phase 3 — Run and test

```bash
# terminal 1 — the worker must be running, or there's no agent to dispatch
npm run agent:dev

# terminal 2 — the kitchen dashboard
npm run dev            # http://localhost:3000
```

Then **call the Exotel DID from a real phone.**

Expected:
1. Arya answers and greets you as Gattu's Chinese.
2. Order in Hinglish: *"ek veg hakka noodles full aur ek chicken manchurian half"*
   → she should read back **₹190 + ₹120 = ₹310**, ask pickup or delivery, and take your name.
3. Confirm → `[capture_order] saved` in the worker log → the order appears on the
   dashboard within 5 seconds.

`UPSTASH_REDIS_REST_URL` / `_TOKEN` must be set before this works — `capture_order`
writes to Redis and the dashboard reads from it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Phone rings, then silence, room opens with no agent | `agentName` in the dispatch rule ≠ `LIVEKIT_AGENT_NAME`, or the worker isn't running |
| Call fails at Exotel, never reaches LiveKit | Destination URI wrong (missing `:5061;transport=tls`), or the applet dials the FQDN instead of `sip:<trunk_sid>` |
| LiveKit rejects the INVITE (401/403) | Digest username/password mismatch between the Exotel credentials and the LiveKit inbound trunk |
| Call connects but `capture_order` throws | Upstash Redis env vars are blank |
| Agent joins but is deaf/mute | Check the Vertex env (`GOOGLE_APPLICATION_CREDENTIALS` path, `GOOGLE_CLOUD_LOCATION=us-central1`) |

Inspect live state with:

```bash
lk sip inbound list
lk sip dispatch list
```
