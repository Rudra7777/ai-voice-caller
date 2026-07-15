import { describe, it, expect } from 'vitest'
import {
  halfPrice, priceOf, findMenuItem, renderMenuForPrompt,
  type MenuItem, type Restaurant,
} from '../lib/menu'

const noodles: MenuItem = {
  id: 'veg-hakka-noodles', name: 'Veg Hakka Noodles', veg: true,
  category: 'Noodles', sizes: { full: 190, half: 100 }, tags: ['bestseller'],
}
const soup: MenuItem = {
  id: 'veg-clear-soup', name: 'Veg Clear Soup', veg: true,
  category: 'Soup', sizes: { full: 120 }, tags: [],
}
const menu = [noodles, soup]
const restaurant: Restaurant = { name: "Gattu's Chinese", readyEstimateMins: 20, deliveryAreas: ['Vile Parle West'], deliveryFee: 30 }

describe('halfPrice', () => {
  it("matches the owner's stated examples", () => {
    expect(halfPrice(280)).toBe(150)
    expect(halfPrice(300)).toBe(160)
    expect(halfPrice(270)).toBe(140)
  })

  it('rounds up to the next 10', () => {
    expect(halfPrice(190)).toBe(100)
    expect(halfPrice(200)).toBe(110)
    expect(halfPrice(340)).toBe(180)
  })
})

describe('priceOf', () => {
  it('returns the price for a size that exists', () => {
    expect(priceOf(noodles, 'full')).toBe(190)
    expect(priceOf(noodles, 'half')).toBe(100)
  })

  it('returns undefined for a size the item does not have', () => {
    expect(priceOf(soup, 'half')).toBeUndefined()
  })
})

describe('findMenuItem', () => {
  it('finds by id', () => {
    expect(findMenuItem(menu, 'veg-clear-soup')).toBe(soup)
  })

  it('returns undefined for an unknown id', () => {
    expect(findMenuItem(menu, 'butter-chicken')).toBeUndefined()
  })
})

describe('renderMenuForPrompt', () => {
  it('lists every item with its id, prices and tags, grouped by category', () => {
    const text = renderMenuForPrompt(menu, restaurant)
    expect(text).toContain("Gattu's Chinese")
    expect(text).toContain('Noodles')
    expect(text).toContain('veg-hakka-noodles')
    expect(text).toContain('Veg Hakka Noodles')
    expect(text).toContain('full 190')
    expect(text).toContain('half 100')
    expect(text).toContain('bestseller')
    expect(text).toContain('veg-clear-soup')
  })

  it('marks items that have no half portion', () => {
    const text = renderMenuForPrompt(menu, restaurant)
    expect(text).toMatch(/Veg Clear Soup.*full only/)
  })
})
