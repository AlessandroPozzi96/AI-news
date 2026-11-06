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

describe('mail design', () => {
  it('has a header with only the name and the date, and a minimal footer', () => {
    const mail = renderEmail(issue([item(1)]), links)
    expect(mail.html).not.toContain("L'essentiel de la semaine")
    expect(mail.html).toContain('Dev Agents Weekly')
    expect(mail.html).toContain('30 octobre 2026')
    expect(mail.html).toContain(`href="${links.unsubscribe.replace(/&/g, '&amp;')}"`)
  })

  it('shows no chip, no number before the titles and one sentence per item', () => {
    const mail = renderEmail(issue([item(1), item(2)]), links)
    expect(mail.html).not.toContain('border-radius:10px')
    expect(mail.html).not.toContain('1. Title 1')
    expect(mail.html).toContain('>Title 1<')
    expect(mail.html).toContain('Summary 2')
  })

  it('keeps the e-mail free of theme controls', () => {
    const mail = renderEmail(issue([item(1)]), links)
    expect(mail.html.toLowerCase()).not.toContain('theme')
    expect(mail.text.toLowerCase()).not.toContain('theme')
  })

  it('keeps the text version plain: no category brackets', () => {
    const mail = renderEmail(issue([item(1)]), links)
    expect(mail.text).not.toMatch(/\[[^\]]*\]/)
    expect(mail.text).toContain('Title 1')
    expect(mail.text).toContain('Summary 1')
  })

  it('handles a very long summary without breaking the e-mail', () => {
    const long = `${'Un résumé très long sans fin. '.repeat(40)}`
    const mail = renderEmail(issue([item(1, { summary: long })]), links)
    expect(mail.html).toContain('Un résumé très long')
    expect(mail.html).toContain('<table')
  })
})

describe('web design', () => {
  const pageOf = async (path: string, init?: RequestInit) => {
    const res = await SELF.fetch(`https://x.test${path}`, init)
    return { res, html: await res.text() }
  }
  const scriptSrcOf = (csp: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? ''

  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    await saveIssue(env.DB, '2026-S50', 'fr', [item(1, { section: 'news' }), item(2, { section: 'claude_code' })])
    await env.DB.prepare("UPDATE issues SET status = 'sent', sent_at = datetime('now') WHERE id = ?").bind('2026-S50').run()
  })

  it('serves the theme script as an external JavaScript file', async () => {
    const { res, html } = await pageOf('/theme.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('javascript')
    expect(html).toContain('localStorage')
    expect(html).toContain('data-theme')
    expect(html).not.toContain('<script')
  })

  it('loads the theme script blocking in the head, and the picker starts hidden', async () => {
    const { html } = await pageOf('/issue/2026-S50')
    expect(html).toContain('<script src="/theme.js"></script>')
    expect(html.indexOf('/theme.js')).toBeLessThan(html.indexOf('<body>'))
    expect(html).toMatch(/<div class="theme" id="theme-picker" role="group"[^>]*\shidden[ =>]/)
  })

  it('does not put any theme in the default HTML, so public pages stay cacheable without a cookie', async () => {
    const { res, html } = await pageOf('/issue/2026-S50')
    expect(html).toContain('<html lang="fr">')
    expect(html).not.toMatch(/<html[^>]*data-theme/)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('allows same-origin scripts only, with no inline script and no unsafe-inline for scripts', async () => {
    for (const path of ['/issue/2026-S50', '/issue/2026-S50/1', '/unsubscribe?token=x', '/admin/login']) {
      const { res, html } = await pageOf(path)
      const csp = res.headers.get('Content-Security-Policy') ?? ''
      expect(scriptSrcOf(csp)).toContain("'self'")
      expect(scriptSrcOf(csp)).not.toContain("'unsafe-inline'")
      expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/)
    }
  })

  it('keeps every other directive strict', async () => {
    const { res } = await pageOf('/issue/2026-S50')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('frame-ancestors')
  })

  it('sends the stylesheet unescaped, so the theme selectors and font names reach the browser', async () => {
    const { html } = await pageOf('/issue/2026-S50')
    expect(html).toContain(':root:not([data-theme="light"])')
    expect(html).toContain(':root[data-theme="dark"]')
    expect(html).toContain("'Segoe UI'")
  })

  it('uses only system fonts (no external font)', async () => {
    const { html } = await pageOf('/issue/2026-S50')
    expect(html).not.toContain('fonts.googleapis')
    expect(html).not.toContain('@import')
  })

  it('renders no chips, no cards and no bordered items on the issue page', async () => {
    const { html } = await pageOf('/issue/2026-S50')
    expect(html).not.toContain('class="chip')
    expect(html).not.toContain('class="card"')
    expect(html).toContain('Actualités')
  })

  it('shows the theme choices in the footer, as buttons', async () => {
    const { html } = await pageOf('/issue/2026-S50')
    for (const choice of ['auto', 'light', 'dark']) expect(html).toContain(`data-theme-choice="${choice}"`)
  })
})

describe('sections', () => {
  const sectioned = (): IssueItem[] => [
    item(1, { section: 'news' }),
    item(2, { section: 'news' }),
    item(3, { section: 'news' }),
    item(4, { section: 'must_have' }),
    item(5, { section: 'must_have' }),
    item(6, { section: 'claude_code', claudeCode: true }),
    item(7, { section: 'claude_code', claudeCode: true }),
  ]

  it('groups the e-mail under one heading per section, in order (text version)', () => {
    const mail = renderEmail(issue(sectioned()), links)
    const at = (s: string) => mail.text.indexOf(s)
    expect(at('Actualités')).toBeGreaterThanOrEqual(0)
    expect(at('Actualités')).toBeLessThan(at('Indispensables'))
    expect(at('Indispensables')).toBeLessThan(at('Claude Code'))
    expect(mail.text.split('Actualités')).toHaveLength(2)
  })

  it('shows the section headings in the html e-mail', () => {
    const mail = renderEmail(issue(sectioned(), 'en'), links)
    expect(mail.html).toContain('>News<')
    expect(mail.html).toContain('>Must-haves<')
    expect(mail.html).toContain('>Claude Code<')
  })

  it('renders an issue without sections (older issues) with no heading', () => {
    const mail = renderEmail(issue([item(1), item(2)]), links)
    expect(mail.html).not.toContain('Indispensables')
    expect(mail.html).not.toContain('Actualités')
    expect(mail.text).not.toContain('Indispensables')
  })

  it('shows the section headings on the issue page', async () => {
    const html = await renderPage(IssuePage({ issue: issue(sectioned()), links }))
    expect(html).toContain('Actualités')
    expect(html).toContain('Indispensables')
    const plain = await renderPage(IssuePage({ issue: issue([item(1)]), links }))
    expect(plain).not.toContain('Actualités')
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

  it('stores the section of each item, and reads older rows (no section) without one', async () => {
    await saveIssue(env.DB, '2026-S43', 'fr', [item(1, { section: 'must_have' }), item(2)])
    const stored = await getIssue(env.DB, '2026-S43')
    expect(stored?.items.map((i) => i.section)).toEqual(['must_have', undefined])

    await env.DB.prepare(
      "INSERT INTO issues (id, language, status, sent_at) VALUES ('2026-S30', 'fr', 'sent', datetime('now'))",
    ).run()
    await env.DB.prepare(
      `INSERT INTO items (issue_id, position, category, title, summary, details_json, source_url, source_name, claude_code)
       VALUES ('2026-S30', 1, 'other', 'Old title', 'Old summary', ?, 'https://example.com/old', 'example', 0)`,
    )
      .bind(JSON.stringify({ intro: 'i', key_points: [], commands: [], why_it_matters: 'w' }))
      .run()
    const res = await SELF.fetch('https://x.test/issue/2026-S30')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Old title')
    expect(body).not.toContain('Actualités')
    expect(body).not.toContain('Indispensables')
  })
})
