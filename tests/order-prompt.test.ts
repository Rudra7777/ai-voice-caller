import { describe, it, expect } from 'vitest'
import { buildOrderPrompt } from '../config/order-prompt'
import { MENU, RESTAURANT } from '../config/menu'

describe('buildOrderPrompt', () => {
  const prompt = buildOrderPrompt(MENU, RESTAURANT)

  it('embeds the whole menu so the agent is grounded to real dishes and prices', () => {
    expect(prompt).toContain('veg-hakka-noodles')
    expect(prompt).toContain('full 190')
    expect(prompt).toContain('chicken-lollypop-gravy')
    expect(prompt).toContain("Gattu's Chinese")
  })

  it('names the tools it must call', () => {
    expect(prompt).toContain('capture_order')
    expect(prompt).toContain('end_call')
  })

  it('requires a read-back before saving', () => {
    expect(prompt.toLowerCase()).toContain('read back')
  })

  it('tells the agent to ask half or full', () => {
    expect(prompt.toLowerCase()).toContain('half ya full')
  })

  it('tells the agent to ask pickup or delivery and confirm the address', () => {
    expect(prompt.toLowerCase()).toContain('pickup')
    expect(prompt.toLowerCase()).toContain('delivery')
    expect(prompt.toLowerCase()).toContain('address')
  })

  it('lists the delivery areas so the agent can decline out-of-zone addresses', () => {
    for (const area of RESTAURANT.deliveryAreas) {
      expect(prompt).toContain(area)
    }
  })

  it('tells the agent to capture a complete address (flat number, landmark)', () => {
    expect(prompt.toLowerCase()).toContain('flat')
    expect(prompt.toLowerCase()).toContain('landmark')
  })

  it('forbids inventing dishes and prices', () => {
    expect(prompt).toContain('NEVER')
    expect(prompt.toLowerCase()).toContain('not on the menu')
  })

  it('describes the needs_human fallback', () => {
    expect(prompt).toContain('needs_human')
  })

  it('states the ready-in estimate', () => {
    expect(prompt).toContain('20')
  })
})
