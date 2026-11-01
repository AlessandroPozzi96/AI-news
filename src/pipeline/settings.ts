import type { Language } from '../generate/types'

export type Settings = {
  /** ISO weekday, 1 = Monday ... 7 = Sunday. */
  sendDay: number
  sendHour: number
  timezone: string
  frequencyWeeks: number
  itemsPerIssue: number
  language: Language
}

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  const num = (k: string, fallback: number) => {
    const n = Number(m.get(k))
    return Number.isFinite(n) && m.has(k) ? n : fallback
  }
  return {
    sendDay: num('send_day', 5),
    sendHour: num('send_hour', 18),
    timezone: m.get('timezone') ?? 'Europe/Paris',
    frequencyWeeks: Math.max(1, num('frequency_weeks', 1)),
    itemsPerIssue: num('items_per_issue', 5),
    language: m.get('language') === 'en' ? 'en' : 'fr',
  }
}
