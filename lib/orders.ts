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
