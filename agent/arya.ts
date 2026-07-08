// Arya — LiveKit agent worker.
//
// Dispatched by POST /api/call (see lib/livekit.ts) with {name, phone} as job
// metadata. Runs Gemini Live (via Vertex AI) as a speech-to-speech brain, dials
// the caller over the Twilio SIP trunk, and runs the Hinglish concierge flow.
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
import { RoomServiceClient, SipClient } from 'livekit-server-sdk'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { buildAryaPrompt } from '../config/arya-prompt'

// Hard cap so a chatty caller can't run up cost. Also the safety net that ends
// the call if the model never invokes end_call. ~2 min gives room for follow-ups.
const MAX_CALL_MS = 120_000

type CallMeta = { name: string; phone: string }

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || '{}') as Partial<CallMeta>
    const name = meta.name?.trim() || 'there'
    const phone = meta.phone
    if (!phone) throw new Error('arya: job metadata missing phone number')

    // Join the dispatched room first; ctx.room.name is only populated after connect.
    await ctx.connect()

    const roomName = ctx.room.name
    if (!roomName) throw new Error('arya: room has no name; cannot place call')

    // Call-ending state: once end_call fires, hang up after Arya stops talking
    // so the caller isn't left in dead air (the realtime session goes idle after
    // the goodbye). `speaking` guards against clipping her closing line.
    let flowDone = false
    let ended = false
    let speaking = false
    let hangTimer: ReturnType<typeof setTimeout> | undefined

    // log_lead: Sheets is parked, so just record to the console for now.
    // To re-enable Sheets: import { appendLead, makeSheetsAppender } from
    // '../lib/sheets' and call it here once the GOOGLE_* env vars are set.
    // Freeform fields so Arya can capture whatever the caller actually said
    // (any diet, any budget phrasing, any Mumbai-metro location). Logging no
    // longer ends the call — end_call does — so follow-up requests keep working.
    const logLead = llm.tool({
      description: 'Record the caller preferences and the recommendations given.',
      parameters: z.object({
        location: z.string(),
        diet: z.string().optional(),
        budget: z.string().optional(),
        recommendations: z.array(z.string()),
      }),
      execute: async (args) => {
        console.log('[log_lead]', JSON.stringify({ name, phone, ...args }))
        return 'logged'
      },
    })

    // end_call: the model decides when the conversation is genuinely over
    // (caller says bye / is satisfied). Arms the no-clip hangup below.
    const endCall = llm.tool({
      description:
        'End the call. Invoke only when the caller is finished, as you say your final goodbye line.',
      parameters: z.object({}),
      execute: async () => {
        flowDone = true
        armHangup()
        return 'ending'
      },
    })

    const agent = new voice.Agent({
      instructions: buildAryaPrompt().replaceAll('{{name}}', name),
      tools: { log_lead: logLead, end_call: endCall },
    })

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        // Vertex AI Live native-audio model (GA). NOTE: this is the *Vertex* id,
        // not the AI-Studio id (gemini-2.5-flash-native-audio-preview-12-2025).
        // Supports generateReply for the agent-speaks-first greeting.
        // ⚠️ Do NOT swap to gemini-3.1-flash-live-preview: its id resolves on the
        // Vertex REST metadata endpoint (200) but the Live bidi WebSocket rejects
        // it with code 1008 (verified by a real call 2026-07-08). Not usable yet.
        model: 'gemini-live-2.5-flash-native-audio',
        voice: 'Sulafat',
        temperature: 0.8,
        // Explicit Vertex config (belt-and-suspenders with the GOOGLE_* env vars).
        // Credentials come from GOOGLE_APPLICATION_CREDENTIALS (service account).
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
      }),
    })

    await session.start({ agent, room: ctx.room })

    // Place the outbound call: LiveKit sends an INVITE through the Twilio trunk.
    const sip = new SipClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    )
    await sip.createSipParticipant(
      process.env.LIVEKIT_OUTBOUND_TRUNK_ID!,
      phone,
      roomName,
      { participantIdentity: 'caller', waitUntilAnswered: true },
    )
    // Wait for the callee's audio before greeting (per LiveKit's outbound
    // telephony example) so Arya's opening line isn't clipped.
    await ctx.waitForParticipant('caller')

    // Arya speaks first.
    await session.generateReply({
      instructions: `Greet ${name} by name and start the flow.`,
    })

    // Hang up by deleting the room, both on timeout and on normal shutdown.
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
    // No-op while Arya is still speaking or if a timer is already pending.
    const armHangup = () => {
      if (!flowDone || ended || speaking || hangTimer) return
      hangTimer = setTimeout(() => {
        ended = true
        void hangup()
      }, 1500)
    }
    // End the call shortly after Arya finishes her closing line. After end_call
    // fires, whenever she stops speaking we arm a hangup; if she starts talking
    // again the timer is cancelled, so her goodbye is never clipped.
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
