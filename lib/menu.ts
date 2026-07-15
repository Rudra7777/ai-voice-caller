// Menu domain: types + pure helpers. No data (see config/menu.ts), no I/O.
export type Size = 'full' | 'half'
export type Category = 'Soup' | 'Starter' | 'Noodles' | 'Rice' | 'Side Dish'
export type Tag = 'bestseller' | 'popular' | 'spicy' | 'sweet' | 'chef-special'

export type MenuItem = {
  id: string
  name: string
  veg: boolean
  category: Category
  sizes: { full: number; half?: number }
  tags: Tag[]
}

export type Restaurant = { name: string; readyEstimateMins: number; deliveryAreas: string[] }

// Gattu's half-plate convention: a bit over half the full price, rounded up to
// the next ₹10 (owner's examples: 280→150, 300→160, 270→140).
export function halfPrice(full: number): number {
  return Math.ceil((full / 2 + 5) / 10) * 10
}

export function priceOf(item: MenuItem, size: Size): number | undefined {
  return size === 'half' ? item.sizes.half : item.sizes.full
}

export function findMenuItem(menu: MenuItem[], id: string): MenuItem | undefined {
  return menu.find((i) => i.id === id)
}

// The menu as the agent sees it. Ids are included so capture_order can echo
// them back exactly; prices are here so Arya quotes real numbers.
export function renderMenuForPrompt(menu: MenuItem[], restaurant: Restaurant): string {
  const categories = [...new Set(menu.map((i) => i.category))]
  const lines = categories.map((category) => {
    const items = menu
      .filter((i) => i.category === category)
      .map((i) => {
        const prices = i.sizes.half
          ? `full ${i.sizes.full}, half ${i.sizes.half}`
          : `full ${i.sizes.full} (full only)`
        const tags = i.tags.length ? ` [${i.tags.join(', ')}]` : ''
        const veg = i.veg ? 'veg' : 'non-veg'
        return `- ${i.id} | ${i.name} | ${veg} | ${prices}${tags}`
      })
      .join('\n')
    return `${category}:\n${items}`
  })
  return `${restaurant.name} — MENU (prices in ₹)\n\n${lines.join('\n\n')}`
}
