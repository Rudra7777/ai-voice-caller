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
