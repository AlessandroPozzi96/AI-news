/** ISO 8601 week id such as `2026-S44`, computed in UTC. */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

export const ISSUE_ID_PATTERN = /^\d{4}-S\d{2}$/

export function weekNumber(issueId: string): number {
  return Number(issueId.slice(-2))
}
