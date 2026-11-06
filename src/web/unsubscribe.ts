import { Hono } from 'hono'
import type { Env } from '../env'
import { verifyUnsubscribeToken } from '../mail/token'
import { loadSettings } from '../pipeline/settings'
import { renderPage, UnsubscribePage } from './pages'

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  // form-action 'self' is needed here (the confirmation button posts back), unlike the read-only pages.
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

export const unsubscribeRoutes = new Hono<{ Bindings: Env }>()

async function respond(
  c: { env: Env },
  state: 'confirm' | 'done' | 'invalid',
  status: number,
  action?: string,
): Promise<Response> {
  const { language } = await loadSettings(c.env.DB)
  return new Response(await renderPage(UnsubscribePage({ lang: language, state, action })), { status, headers: HEADERS })
}

// GET only asks for confirmation: mail scanners that prefetch links must not unsubscribe anyone.
unsubscribeRoutes.get('/unsubscribe', async (c) => {
  const token = c.req.query('token') ?? ''
  if ((await verifyUnsubscribeToken(c.env.UNSUBSCRIBE_SECRET, token)) === null) return respond(c, 'invalid', 400)
  return respond(c, 'confirm', 200, `/unsubscribe?token=${encodeURIComponent(token)}`)
})

// POST performs it; this is also the target of the List-Unsubscribe-Post one-click header.
unsubscribeRoutes.post('/unsubscribe', async (c) => {
  const id = await verifyUnsubscribeToken(c.env.UNSUBSCRIBE_SECRET, c.req.query('token') ?? '')
  if (id === null) return respond(c, 'invalid', 400)
  await c.env.DB.prepare(
    "UPDATE subscribers SET active = 0, unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE id = ?",
  )
    .bind(id)
    .run()
  return respond(c, 'done', 200)
})
