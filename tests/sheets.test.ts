import { describe, it, expect, vi } from 'vitest'
import { buildRow, appendLead } from '../lib/sheets'

const lead = {
  name: 'Rohan', phone: '+919820098200', area: 'Bandra',
  foodPref: 'non-veg', budget: '₹1000', recommendations: 'Bademiya; Carter Road', callId: 'call_123',
}

describe('buildRow', () => {
  it('orders columns to match the sheet header', () => {
    const now = new Date('2026-07-05T10:00:00.000Z')
    expect(buildRow(lead, now)).toEqual([
      '2026-07-05T10:00:00.000Z', 'Rohan', '+919820098200', 'Bandra',
      'non-veg', '₹1000', 'Bademiya; Carter Road', 'call_123',
    ])
  })
})

describe('appendLead', () => {
  it('appends one row to the Leads tab', async () => {
    const append = vi.fn().mockResolvedValue(undefined)
    await appendLead({ append, spreadsheetId: 'sheet_1' }, lead)
    expect(append).toHaveBeenCalledOnce()
    const [range, values] = append.mock.calls[0]
    expect(range).toBe('Sheet1!A:H')
    expect(values[1]).toBe('Rohan')
  })
})
