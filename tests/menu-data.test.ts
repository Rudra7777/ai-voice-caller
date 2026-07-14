import { describe, it, expect } from 'vitest'
import { MENU, RESTAURANT } from '../config/menu'
import { halfPrice, findMenuItem } from '../lib/menu'

describe("Gattu's menu data", () => {
  it('has a restaurant name and a ready estimate', () => {
    expect(RESTAURANT.name).toBe("Gattu's Chinese")
    expect(RESTAURANT.readyEstimateMins).toBeGreaterThan(0)
  })

  it('has every item with a unique id', () => {
    const ids = MENU.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(MENU.length).toBeGreaterThan(60)
  })

  it('prices every item with a positive full price', () => {
    for (const item of MENU) expect(item.sizes.full).toBeGreaterThan(0)
  })

  it('gives Noodles, Rice and Side Dishes a half price derived from the full price', () => {
    for (const item of MENU) {
      if (['Noodles', 'Rice', 'Side Dish'].includes(item.category)) {
        expect(item.sizes.half).toBe(halfPrice(item.sizes.full))
        expect(item.sizes.half!).toBeLessThan(item.sizes.full)
      }
    }
  })

  it('serves Soups and Starters full-only', () => {
    for (const item of MENU) {
      if (['Soup', 'Starter'].includes(item.category)) {
        expect(item.sizes.half).toBeUndefined()
      }
    }
  })

  it('carries the real prices from the printed menu', () => {
    expect(findMenuItem(MENU, 'veg-hakka-noodles')!.sizes.full).toBe(190)
    expect(findMenuItem(MENU, 'chicken-lollypop')!.sizes.full).toBe(200)
    expect(findMenuItem(MENU, 'paneer-sz-manchurian-rice')!.sizes.full).toBe(340)
    expect(findMenuItem(MENU, 'veg-clear-soup')!.sizes.full).toBe(120)
    expect(findMenuItem(MENU, 'chicken-lollypop-gravy')!.sizes.full).toBe(350)
  })

  it('marks the chicken and egg dishes non-veg and the rest veg', () => {
    expect(findMenuItem(MENU, 'chicken-fried-rice')!.veg).toBe(false)
    expect(findMenuItem(MENU, 'egg-rice')!.veg).toBe(false)
    expect(findMenuItem(MENU, 'veg-fried-rice')!.veg).toBe(true)
    expect(findMenuItem(MENU, 'paneer-chilly-sauce')!.veg).toBe(true)
  })

  it('tags dishes so Arya can recommend with personality', () => {
    expect(findMenuItem(MENU, 'veg-hakka-noodles')!.tags).toContain('bestseller')
    expect(findMenuItem(MENU, 'veg-szechwan-noodles')!.tags).toContain('spicy')
    expect(findMenuItem(MENU, 'veg-sweet-sour')!.tags).toContain('sweet')
    expect(findMenuItem(MENU, 'gattus-special-rice-veg')!.tags).toContain('chef-special')
  })
})
