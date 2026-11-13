import { SECTION_COUNTS, SECTION_COUNT_RANGE, type Language, type Section } from '../generate/types'

export type Settings = {
  /** ISO weekday, 1 = Monday ... 7 = Sunday. */
  sendDay: number
  sendHour: number
  timezone: string
  frequencyWeeks: number
  language: Language
  /** Items per section of an issue. */
  sectionCounts: Record<Section, number>
}

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  const num = (k: string, fallback: number) => {
    const n = Number(m.get(k))
    return Number.isFinite(n) && m.has(k) ? n : fallback
  }
  // A stored count outside the allowed range (edited by hand in the database) falls back to the default.
  const count = (section: Section) => {
    const n = num(`count_${section}`, SECTION_COUNTS[section])
    const [min, max] = SECTION_COUNT_RANGE
    return Number.isInteger(n) && n >= min && n <= max ? n : SECTION_COUNTS[section]
  }
  return {
    sectionCounts: { news: count('news'), must_have: count('must_have'), claude_code: count('claude_code') },
    sendDay: num('send_day', 5),
    sendHour: num('send_hour', 18),
    timezone: m.get('timezone') ?? 'Europe/Paris',
    frequencyWeeks: Math.max(1, num('frequency_weeks', 1)),
    language: m.get('language') === 'en' ? 'en' : 'fr',
  }
}
