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

// Hard cap so a chatty caller can't run up cost (mirrors the old Vapi 60s cap).
const MAX_CALL_MS = 60_000

type CallMeta = { name: string; phone: string }

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || '{}') as Partial<CallMeta>
    const name = meta.name?.trim() || 'there'
    const phone = meta.phone
    if (!phone) throw new Error('arya: job metadata missing phone number')

    const roomName = ctx.room.name
    if (!roomName) throw new Error('arya: room has no name; cannot place call')

    // log_lead: Sheets is parked, so just record to the console for now.
    // To re-enable Sheets: import { appendLead, makeSheetsAppender } from
    // '../lib/sheets' and call it here once the GOOGLE_* env vars are set.
    const logLead = llm.tool({
      description: 'Record the caller preferences and the 2 recommendations given.',
      parameters: z.object({
        area: z.string(),
        foodPref: z.enum(['veg', 'non-veg']).optional(),
        budget: z.string().optional(),
        recommendations: z.array(z.string()),
      }),
      execute: async (args) => {
        console.log('[log_lead]', JSON.stringify({ name, phone, ...args }))
        return 'logged'
      },
    })

    const agent = new voice.Agent({
      instructions: buildAryaPrompt().replaceAll('{{name}}', name),
      tools: { log_lead: logLead },
    })

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        // Native-audio Live model (supports generateReply for the greeting).
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        voice: 'Puck',
        temperature: 0.8,
      }),
    })

    await session.start({ agent, room: ctx.room })
    await ctx.connect()

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
    const timer = setTimeout(hangup, MAX_CALL_MS)
    ctx.addShutdownCallback(async () => {
      clearTimeout(timer)
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
