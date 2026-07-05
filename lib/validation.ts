import { parsePhoneNumberFromString } from 'libphonenumber-js'

export type CallInput = { name: string; phone: string; consent: boolean }
export type ValidationResult =
  | { ok: true; value: { name: string; phone: string } }
  | { ok: false; error: string }

export function validateCallInput(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalid_input' }
  const { name, phone, consent } = raw as Record<string, unknown>

  if (consent !== true) return { ok: false, error: 'consent_required' }

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 40)
    return { ok: false, error: 'invalid_name' }

  if (typeof phone !== 'string') return { ok: false, error: 'invalid_phone' }
  const parsed = parsePhoneNumberFromString(phone, 'IN')
  if (!parsed || !parsed.isValid() || parsed.country !== 'IN')
    return { ok: false, error: 'invalid_phone' }

  // Indian mobile numbers start with 6, 7, 8, or 9
  const firstDigit = parsed.nationalNumber?.[0]
  if (!['6', '7', '8', '9'].includes(firstDigit))
    return { ok: false, error: 'invalid_phone' }

  return { ok: true, value: { name: name.trim(), phone: parsed.number } }
}
