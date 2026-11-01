import { isoWeekId } from '../issues/week'
import type { Settings } from './settings'

const CATCH_UP_HOURS = 48
const DAY_MS = 86_400_000

type LocalParts = { year: number; month: number; day: number; isoWeekday: number; hour: number; minute: number }

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    isoWeekday: WEEKDAYS[get('weekday')] ?? 1,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

/** ISO week id of the local calendar date, so a Friday evening in Paris is never mis-dated by UTC. */
export function weekIdIn(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone)
  return isoWeekId(new Date(Date.UTC(p.year, p.month - 1, p.day)))
}

/**
 * True once the configured local send time of the current week has passed, for up to 48 hours
 * (so an hour missed by an outage is caught up), unless this week's issue is already sent or the
 * previous issue is too recent for the configured frequency.
 */
export function isDue(
  now: Date,
  settings: Settings,
  state: { currentWeekSent: boolean; lastSentAt: Date | null },
): boolean {
  if (state.currentWeekSent) return false
  const p = localParts(now, settings.timezone)
  const nowMinutes = (p.isoWeekday - 1) * 1440 + p.hour * 60 + p.minute
  const scheduled = (settings.sendDay - 1) * 1440 + settings.sendHour * 60
  if (nowMinutes < scheduled || nowMinutes >= scheduled + CATCH_UP_HOURS * 60) return false
  if (state.lastSentAt) {
    const minGap = (settings.frequencyWeeks * 7 - 1) * DAY_MS
    if (now.getTime() - state.lastSentAt.getTime() < minGap) return false
  }
  return true
}
