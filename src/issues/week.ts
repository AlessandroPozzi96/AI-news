/** ISO 8601 week id such as `2026-S44`, computed in UTC. */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

/**
 * `2026-S45` is the automatic issue of that week. Manual issues (sent from the admin dashboard)
 * add a suffix from 2 on: `2026-S45-2`, `2026-S45-3`... so they never collide with the automatic one.
 */
export const ISSUE_ID_PATTERN = /^\d{4}-S\d{2}(?:-[1-9]\d*)?$/

/** Week number of an issue id, automatic or manual. */
export function weekNumber(issueId: string): number {
  return Number(issueId.slice(6, 8))
}
