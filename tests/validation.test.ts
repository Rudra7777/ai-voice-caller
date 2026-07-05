import { describe, it, expect } from 'vitest'
import { validateCallInput } from '../lib/validation'

describe('validateCallInput', () => {
  it('accepts a valid Indian mobile and normalizes to E.164', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '9820098200', consent: true })
    expect(r).toEqual({ ok: true, value: { name: 'Rohan', phone: '+919820098200' } })
  })
  it('accepts a +91-prefixed number', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '+91 98200 98200', consent: true })
    expect(r.ok && r.value.phone).toBe('+919820098200')
  })
  it('rejects missing consent', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '9820098200', consent: false })
    expect(r).toEqual({ ok: false, error: 'consent_required' })
  })
  it('rejects a non-Indian number', () => {
    const r = validateCallInput({ name: 'Rohan', phone: '+14155552671', consent: true })
    expect(r).toEqual({ ok: false, error: 'invalid_phone' })
  })
  it('rejects a too-short name', () => {
    const r = validateCallInput({ name: 'R', phone: '9820098200', consent: true })
    expect(r).toEqual({ ok: false, error: 'invalid_name' })
  })
  it('rejects garbage input', () => {
    const r = validateCallInput(null)
    expect(r).toEqual({ ok: false, error: 'invalid_input' })
  })
})
