import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { IssueItem } from '../src/generate/types'
import { getIssue, saveIssue } from '../src/issues/store'
import { isoWeekId } from '../src/issues/week'
import { renderEmail } from '../src/render/email'
import { safeHref, type Links, type RenderIssue } from '../src/render/shared'
import { IssuePage, ItemPage, renderPage } from '../src/web/pages'

const item = (position: number, over: Partial<IssueItem> = {}): IssueItem => ({
  position,
  category: 'skill_tool',
  claudeCode: position === 1,
  title: `Title ${position}`,
  summary: `Summary ${position}`,
  details: { intro: 'Intro', key_points: ['p1', 'p2'], commands: ['npm i -g tool'], why_it_matters: 'Matters' },
  sourceUrl: `https://example.com/${position}`,
  sourceName: 'example',
  ...over,
})

const links: Links = {
  issue: 'https://news.test/issue/2026-S44',
  item: (p) => `https://news.test/issue/2026-S44/${p}`,
  unsubscribe: 'https://news.test/unsubscribe?token=abc&x=1',
}

const issue = (items: IssueItem[], language: 'fr' | 'en' = 'fr'): RenderIssue => ({
  id: '2026-S44',
  language,
  items,
  date: new Date('2026-10-30T16:00:00Z'),
})

const XSS = '<script>alert(1)</script>"><img src=x onerror=alert(1)>'

describe('isoWeekId', () => {
  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeekId(new Date('2026-10-30T12:00:00Z'))).toBe('2026-S44')
    expect(isoWeekId(new Date('2026-01-01T12:00:00Z'))).toBe('2026-S01')
    expect(isoWeekId(new Date('2027-01-01T12:00:00Z'))).toBe('2026-S53')
    expect(isoWeekId(new Date('2024-12-30T12:00:00Z'))).toBe('2025-S01')
  })
})

describe('safeHref', () => {
  it('only allows http(s)', () => {
    expect(safeHref('https://a.test/x')).toBe('https://a.test/x')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('not a url')).toBeNull()
  })
})

describe('email', () => {
  it('builds subject, links and a plain-text alternative', () => {
    const mail = renderEmail(issue([item(1), item(2)]), links)
    expect(mail.subject).toBe('Dev Agents Weekly #44 — Title 1')
    expect(mail.html).toContain('href="https://news.test/issue/2026-S44/2"')
    expect(mail.html).toContain('Se désabonner')
    expect(mail.html).toContain('lang="fr"')
    expect(mail.text).toContain('https://news.test/issue/2026-S44/1')
    expect(mail.text).toContain('https://news.test/unsubscribe?token=abc&x=1')
  })

  it('switches labels with the language', () => {
    const mail = renderEmail(issue([item(1)], 'en'), links)
    expect(mail.html).toContain('Unsubscribe')
    expect(mail.html).toContain('Read more')
  })

  it('escapes generated text and attribute values', () => {
    const mail = renderEmail(issue([item(1, { title: XSS, summary: XSS })]), {
      ...links,
      unsubscribe: `https://news.test/u?x="><script>alert(1)</script>`,
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})

describe('web pages', () => {
  it('escapes everything the model produced', async () => {
    const evil = item(1, {
      title: XSS,
      summary: XSS,
      details: { intro: XSS, key_points: [XSS], commands: [XSS], why_it_matters: XSS },
    })
    const html = await renderPage(ItemPage({ issue: issue([evil]), item: evil, links }))
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not render a link for a non-http source url', async () => {
    const bad = item(1, { sourceUrl: 'javascript:alert(1)' })
    const html = await renderPage(ItemPage({ issue: issue([bad]), item: bad, links }))
    expect(html).not.toContain('javascript:')
  })

  it('opens external links safely and marks pages noindex', async () => {
    const html = await renderPage(ItemPage({ issue: issue([item(1)]), item: item(1), links }))
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('noindex')
    expect(html).toContain('npm i -g tool')
  })

  it('lists every item on the issue page', async () => {
    const html = await renderPage(IssuePage({ issue: issue([item(1), item(2)]), links }))
    expect(html).toContain('Title 1')
    expect(html).toContain('Title 2')
    expect(html).toContain('href="https://news.test/issue/2026-S44/2"')
  })
})

describe('store and routes', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })

  it('round-trips an issue and lets a draft be re-saved', async () => {
    await saveIssue(env.DB, '2026-S40', 'fr', [item(1), item(2)])
    await saveIssue(env.DB, '2026-S40', 'en', [item(1)])
    const stored = await getIssue(env.DB, '2026-S40')
    expect(stored?.language).toBe('en')
    expect(stored?.items).toHaveLength(1)
    expect(stored?.items[0].details.commands).toEqual(['npm i -g tool'])
  })

  it('refuses to overwrite a sent issue', async () => {
    await saveIssue(env.DB, '2026-S41', 'fr', [item(1)])
    await env.DB.prepare("UPDATE issues SET status = 'sent', sent_at = datetime('now') WHERE id = ?").bind('2026-S41').run()
    await expect(saveIssue(env.DB, '2026-S41', 'fr', [item(1)])).rejects.toThrow('already sent')
  })

  it('serves sent issues with security headers, hides drafts and bad ids', async () => {
    await saveIssue(env.DB, '2026-S42', 'fr', [item(1, { title: 'Hello <b>x</b>' })])
    expect((await SELF.fetch('https://x.test/issue/2026-S42')).status).toBe(404)

    await env.DB.prepare("UPDATE issues SET status = 'sent', sent_at = datetime('now') WHERE id = ?").bind('2026-S42').run()
    const ok = await SELF.fetch('https://x.test/issue/2026-S42/1')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(ok.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    const body = await ok.text()
    expect(body).toContain('Hello &lt;b&gt;x&lt;/b&gt;')

    expect((await SELF.fetch('https://x.test/issue/2026-S42/9')).status).toBe(404)
    expect((await SELF.fetch('https://x.test/issue/..%2f..%2fetc')).status).toBe(404)
    expect((await SELF.fetch("https://x.test/issue/2026-S42'--")).status).toBe(404)
  })
})
