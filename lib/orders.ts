// Order domain. buildOrder is pure and is the ONLY thing that decides what an
// order costs: the model reports what was ordered, this code prices it from
// config/menu.ts. The model's arithmetic is never trusted.
import { findMenuItem, priceOf, type MenuItem, type Size } from './menu'

export type OrderStatus = 'new' | 'needs_human'
export type OrderType = 'pickup' | 'delivery'

export type OrderItemInput = { id: string; size: Size; qty: number; note?: string }

export type OrderInput = {
  customerName: string
  phone: string
  type: OrderType
  address?: string
  items: OrderItemInput[]
  status?: OrderStatus
  note?: string
}

export type OrderItem = {
  id: string; name: string; size: Size; qty: number; price: number; note?: string
}

export type Order = {
  id: string
  ts: string
  customerName: string
  phone: string
  type: OrderType
  address?: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  note?: string
}

export type BuildResult = { ok: true; order: Order } | { ok: false; error: string }

export function buildOrder(
  menu: MenuItem[], input: OrderInput, now: Date, id: string,
): BuildResult {
  const status: OrderStatus = input.status ?? 'new'

  // A needs_human record exists precisely to salvage a call Arya couldn't
  // finish, so it may have no items. A real order may not.
  if (status === 'new' && input.items.length === 0) {
    return { ok: false, error: 'empty_order' }
  }
  if (input.type === 'delivery' && !input.address?.trim()) {
    return { ok: false, error: 'address_required' }
  }

  const items: OrderItem[] = []
  for (const line of input.items) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      return { ok: false, error: 'invalid_qty' }
    }
    const menuItem = findMenuItem(menu, line.id)
    if (!menuItem) return { ok: false, error: 'unknown_item' }

    const price = priceOf(menuItem, line.size)
    if (price === undefined) return { ok: false, error: 'unknown_size' }

    items.push({
      id: menuItem.id, name: menuItem.name, size: line.size,
      qty: line.qty, price,
      ...(line.note ? { note: line.note } : {}),
    })
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return {
    ok: true,
    order: {
      id,
      ts: now.toISOString(),
      customerName: input.customerName,
      phone: input.phone,
      type: input.type,
      ...(input.type === 'delivery' && input.address ? { address: input.address } : {}),
      items,
      total,
      status,
      ...(input.note ? { note: input.note } : {}),
    },
  }
}

// --- persistence -----------------------------------------------------------
// Minimal surface we need from @upstash/redis, so tests inject a fake and no
// network runs (same pattern as the rest of lib/).
export type RedisLike = {
  lpush: (key: string, value: string) => Promise<number>
  lrange: (key: string, start: number, stop: number) => Promise<unknown[]>
}

export type OrderDeps = { redis: RedisLike }

export const ORDERS_KEY = 'orders'

export async function saveOrder(deps: OrderDeps, order: Order): Promise<void> {
  await deps.redis.lpush(ORDERS_KEY, JSON.stringify(order))
}

export async function listOrders(deps: OrderDeps, limit = 50): Promise<Order[]> {
  const rows = await deps.redis.lrange(ORDERS_KEY, 0, limit - 1)
  const orders: Order[] = []
  for (const row of rows) {
    // Upstash deserializes JSON automatically; a plain client hands back strings.
    if (typeof row === 'string') {
      try {
        orders.push(JSON.parse(row) as Order)
      } catch {
        // A corrupt row shouldn't take down the kitchen's dashboard.
      }
    } else if (row && typeof row === 'object') {
      orders.push(row as Order)
    }
  }
  return orders
}

// Real client factory (not exercised in unit tests).
export function makeRedis(): RedisLike {
  // Imported lazily so the test path never needs the SDK or its env vars.
  const { Redis } = require('@upstash/redis')
  return Redis.fromEnv() as RedisLike
}
