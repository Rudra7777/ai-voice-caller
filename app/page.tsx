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
