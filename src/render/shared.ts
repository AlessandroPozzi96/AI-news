import type { IssueItem, Language } from '../generate/types'

export type RenderIssue = {
  id: string
  language: Language
  items: IssueItem[]
  date: Date
}

/** URL builders, injected so the same renderers work online and in the local preview. */
export type Links = {
  issue: string
  item: (position: number) => string
  unsubscribe: string
}

/** Only http(s) links are ever rendered as hrefs; anything else (javascript:, data:) is dropped. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(date)
}
