import type { Settings } from '../pipeline/settings'

export type EditableSettings = Pick<Settings, 'sendDay' | 'sendHour' | 'frequencyWeeks' | 'language'>

export const LIMITS = {
  sendDay: [1, 7],
  sendHour: [0, 23],
  frequencyWeeks: [1, 4],
} as const

function intInRange(raw: unknown, [min, max]: readonly [number, number]): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

/** Validates a submitted settings form; the timezone is deliberately not editable from the dashboard. */
export function parseSettingsForm(
  form: Record<string, unknown>,
): { ok: true; values: EditableSettings } | { ok: false; error: string } {
  const sendDay = intInRange(form.send_day, LIMITS.sendDay)
  const sendHour = intInRange(form.send_hour, LIMITS.sendHour)
  const frequencyWeeks = intInRange(form.frequency_weeks, LIMITS.frequencyWeeks)
  if (sendDay === null) return { ok: false, error: 'Jour invalide.' }
  if (sendHour === null) return { ok: false, error: 'Heure invalide (0-23).' }
  if (frequencyWeeks === null) return { ok: false, error: 'Fréquence invalide (1 à 4 semaines).' }
  if (form.language !== 'fr' && form.language !== 'en') return { ok: false, error: 'Langue invalide.' }
  return { ok: true, values: { sendDay, sendHour, frequencyWeeks, language: form.language } }
}

export async function saveSettings(db: D1Database, v: EditableSettings): Promise<void> {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  )
  await db.batch([
    upsert.bind('send_day', String(v.sendDay)),
    upsert.bind('send_hour', String(v.sendHour)),
    upsert.bind('frequency_weeks', String(v.frequencyWeeks)),
    upsert.bind('language', v.language),
  ])
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && EMAIL.test(email) ? email : null
}

export type SubscriberRow = { id: number; email: string; active: number; created_at: string }

export const listSubscribers = async (db: D1Database): Promise<SubscriberRow[]> =>
  (await db.prepare('SELECT id, email, active, created_at FROM subscribers ORDER BY id').all<SubscriberRow>()).results

/** Adds a subscriber, or reactivates one who unsubscribed earlier. */
export async function addSubscriber(db: D1Database, email: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscribers (email) VALUES (?)
       ON CONFLICT (email) DO UPDATE SET active = 1, unsubscribed_at = NULL`,
    )
    .bind(email)
    .run()
}

export async function setSubscriberActive(db: D1Database, id: number, active: boolean): Promise<void> {
  await db
    .prepare(
      `UPDATE subscribers SET active = ?1,
         unsubscribed_at = CASE WHEN ?1 = 1 THEN NULL ELSE COALESCE(unsubscribed_at, datetime('now')) END
       WHERE id = ?2`,
    )
    .bind(active ? 1 : 0, id)
    .run()
}

export type IssueRow = { id: string; status: string; sent_at: string | null; created_at: string }
export type RunRow = { id: number; issue_id: string | null; started_at: string; status: string; error: string | null; llm_cost_usd: number | null }

export const recentIssues = async (db: D1Database): Promise<IssueRow[]> =>
  (await db.prepare('SELECT id, status, sent_at, created_at FROM issues ORDER BY created_at DESC LIMIT 10').all<IssueRow>()).results

export const recentRuns = async (db: D1Database): Promise<RunRow[]> =>
  (
    await db
      .prepare('SELECT id, issue_id, started_at, status, error, llm_cost_usd FROM runs ORDER BY id DESC LIMIT 10')
      .all<RunRow>()
  ).results
