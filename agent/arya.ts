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
        const result = buildOrder(MENU, { ...args, phone }, new Date(), randomUUID(), RESTAURANT.deliveryFee)
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
        // Male voice, upbeat/warm — suits a busy-but-friendly order-taker.
        // Other male options: 'Charon' (calmer/deeper), 'Orus' (firm).
        voice: 'Puck',
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
