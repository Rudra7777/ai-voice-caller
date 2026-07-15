import { describe, it, expect, vi } from 'vitest'
import {
  buildOrder, saveOrder, listOrders, ORDERS_KEY,
  type Order, type OrderInput, type RedisLike,
} from '../lib/orders'
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

  it('adds the delivery fee to the total on delivery orders only', () => {
    const delivery = buildOrder(menu, { ...base, type: 'delivery', address: '12 Hill Road, Bandra West' }, now, id, 30)
    expect(delivery.ok && delivery.order.total).toBe(410)
    expect(delivery.ok && delivery.order.deliveryFee).toBe(30)
    const pickup = buildOrder(menu, base, now, id, 30)
    expect(pickup.ok && pickup.order.total).toBe(380)
    expect(pickup.ok && pickup.order.deliveryFee).toBeUndefined()
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
