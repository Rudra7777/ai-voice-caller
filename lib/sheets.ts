import { google } from 'googleapis'

export type LeadRow = {
  name: string; phone: string; area: string; foodPref: string
  budget: string; recommendations: string; callId: string
}

export function buildRow(lead: LeadRow, now: Date): string[] {
  return [
    now.toISOString(), lead.name, lead.phone, lead.area,
    lead.foodPref, lead.budget, lead.recommendations, lead.callId,
  ]
}

type Deps = { append: (range: string, values: string[]) => Promise<void>; spreadsheetId: string }

export async function appendLead(deps: Deps, lead: LeadRow): Promise<void> {
  await deps.append('Sheet1!A:H', buildRow(lead, new Date()))
}

// Real Google client factory (not exercised in unit tests).
export function makeSheetsAppender(serviceAccountJson: string, spreadsheetId: string): Deps {
  const creds = JSON.parse(serviceAccountJson)
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  return {
    spreadsheetId,
    append: async (range, values) => {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW',
        requestBody: { values: [values] },
      })
    },
  }
}
