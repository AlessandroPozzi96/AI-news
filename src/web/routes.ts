import { Hono } from 'hono'
import type { Language } from '../generate/types'
import { ISSUE_ID_PATTERN } from '../issues/week'
import { getIssue, PUBLIC_STATUSES } from '../issues/store'
import type { Links, RenderIssue } from '../render/shared'
import { IssuePage, ItemPage, NotFoundPage, renderPage } from './pages'

type Env = { Bindings: { DB: D1Database } }

// Pages are public by link but must not be indexed; the strict CSP forbids scripts entirely.
const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

const CACHE_SENT = 'public, max-age=3600'
const CACHE_NONE = 'no-store'

export function linksFor(issueId: string, origin: string): Links {
  return {
    issue: `${origin}/issue/${issueId}`,
    item: (position) => `${origin}/issue/${issueId}/${position}`,
    unsubscribe: `${origin}/unsubscribe`,
  }
}

export const webRoutes = new Hono<Env>()

async function load(db: D1Database, id: string): Promise<{ issue: RenderIssue; sent: boolean } | null> {
  if (!ISSUE_ID_PATTERN.test(id)) return null
  const stored = await getIssue(db, id)
  // Drafts are not public: links only exist once the issue is going out.
  if (!stored || !PUBLIC_STATUSES.includes(stored.status)) return null
  return {
    sent: true,
    issue: { id: stored.id, language: stored.language, items: stored.items, date: new Date(stored.sentAt ?? stored.createdAt) },
  }
}

const notFound = async (lang: Language = 'fr') =>
  new Response(await renderPage(NotFoundPage({ lang })), {
    status: 404,
    headers: { ...HEADERS, 'Cache-Control': CACHE_NONE },
  })

webRoutes.get('/issue/:id', async (c) => {
  const found = await load(c.env.DB, c.req.param('id'))
  if (!found) return notFound()
  const links = linksFor(found.issue.id, new URL(c.req.url).origin)
  return new Response(await renderPage(IssuePage({ issue: found.issue, links })), {
    headers: { ...HEADERS, 'Cache-Control': CACHE_SENT },
  })
})

webRoutes.get('/issue/:id/:position', async (c) => {
  const found = await load(c.env.DB, c.req.param('id'))
  const position = Number(c.req.param('position'))
  const item = found?.issue.items.find((i) => i.position === position)
  if (!found || !item) return notFound(found?.issue.language)
  const links = linksFor(found.issue.id, new URL(c.req.url).origin)
  return new Response(await renderPage(ItemPage({ issue: found.issue, item, links })), {
    headers: { ...HEADERS, 'Cache-Control': CACHE_SENT },
  })
})
