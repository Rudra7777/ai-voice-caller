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
