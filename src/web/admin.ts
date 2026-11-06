import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, safeEqual, verifySession } from '../admin/session'
import {
  addSubscriber,
  listSubscribers,
  normalizeEmail,
  parseSettingsForm,
  recentIssues,
  recentRuns,
  saveSettings,
  setSubscriberActive,
} from '../admin/settings'
import { dispatchNewsletter } from '../admin/dispatch'
import type { Env } from '../env'
import { loadSettings } from '../pipeline/settings'
import { AdminPage, LoginPage, type Flash } from './admin-pages'
import { renderPage } from './pages'

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  // 'no-referrer' would make browsers drop the Origin header on same-origin POSTs, which the CSRF check relies on.
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

// Flash messages travel as fixed codes in the query string, never as free text, so nothing is reflected.
const FLASHES: Record<string, Flash> = {
  saved: { kind: 'ok', text: 'Réglages enregistrés.' },
  added: { kind: 'ok', text: 'Destinataire ajouté.' },
  updated: { kind: 'ok', text: 'Destinataire mis à jour.' },
  bad_email: { kind: 'err', text: 'Adresse email invalide.' },
  bad_settings: { kind: 'err', text: 'Réglages invalides.' },
  send_started: {
    kind: 'ok',
    text: 'Envoi lancé : le mail part dans quelques minutes. Suivez le résultat dans Dernières exécutions.',
  },
  send_unconfigured: { kind: 'err', text: 'Envoi impossible : jeton GitHub ou dépôt non configuré.' },
  send_failed: { kind: 'err', text: "GitHub a refusé le lancement de l'envoi : vérifiez le jeton." },
}

const MIN_TOKEN_LENGTH = 16

export const adminRoutes = new Hono<{ Bindings: Env }>()

const html = async (node: Parameters<typeof renderPage>[0], status = 200) =>
  new Response(await renderPage(node), { status, headers: HEADERS })

const redirect = (to: string) => new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } })

function sameHost(origin: string | undefined, url: string): boolean {
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(url).host
  } catch {
    return false // e.g. the literal "null" origin
  }
}

/** Origin must match; when a browser sends none (or "null"), its Sec-Fetch-Site must say same-origin. */
function isSameOriginPost(origin: string | undefined, fetchSite: string | undefined, url: string): boolean {
  if (origin && origin !== 'null') return sameHost(origin, url)
  return fetchSite === 'same-origin'
}

adminRoutes.use('/admin/*', async (c, next) => {
  const token = c.env.ADMIN_TOKEN
  // Without a sufficiently long token the dashboard simply does not exist.
  if (!token || token.length < MIN_TOKEN_LENGTH) return c.notFound()

  // Cookies are SameSite=Strict; this additionally rejects cross-origin form posts.
  if (c.req.method === 'POST') {
    if (!isSameOriginPost(c.req.header('Origin'), c.req.header('Sec-Fetch-Site'), c.req.url)) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  const loggingIn = c.req.path === '/admin/login'
  if (!loggingIn && !(await verifySession(token, getCookie(c, SESSION_COOKIE)))) return redirect('/admin/login')
  await next()
})

adminRoutes.get('/admin/login', () => html(LoginPage({})))

adminRoutes.post('/admin/login', async (c) => {
  const body = await c.req.parseBody()
  const supplied = typeof body.token === 'string' ? body.token : ''
  if (!(await safeEqual(supplied, c.env.ADMIN_TOKEN as string))) {
    return html(LoginPage({ flash: { kind: 'err', text: 'Jeton incorrect.' } }), 401)
  }
  setCookie(c, SESSION_COOKIE, await createSession(c.env.ADMIN_TOKEN as string), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/admin',
    maxAge: SESSION_TTL_SECONDS,
  })
  // c.redirect keeps the Set-Cookie header just queued; a fresh Response would drop it.
  return c.redirect('/admin', 303)
})

adminRoutes.post('/admin/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/admin' })
  return c.redirect('/admin/login', 303)
})

adminRoutes.get('/admin', async (c) => {
  const [settings, subscribers, issues, runs] = await Promise.all([
    loadSettings(c.env.DB),
    listSubscribers(c.env.DB),
    recentIssues(c.env.DB),
    recentRuns(c.env.DB),
  ])
  return html(AdminPage({ settings, subscribers, issues, runs, flash: FLASHES[c.req.query('msg') ?? ''] }))
})

// Asks GitHub to run the pipeline now; the send itself happens in the workflow and shows up in the runs table.
adminRoutes.post('/admin/send-now', async (c) => {
  const token = c.env.GH_DISPATCH_TOKEN
  const repo = c.env.GITHUB_REPO
  if (!token || !repo) return redirect('/admin?msg=send_unconfigured')
  try {
    await dispatchNewsletter(fetch, repo, token)
  } catch {
    return redirect('/admin?msg=send_failed')
  }
  return redirect('/admin?msg=send_started')
})

adminRoutes.post('/admin/settings', async (c) => {
  const parsed = parseSettingsForm(await c.req.parseBody())
  if (!parsed.ok) return redirect('/admin?msg=bad_settings')
  await saveSettings(c.env.DB, parsed.values)
  return redirect('/admin?msg=saved')
})

adminRoutes.post('/admin/subscribers', async (c) => {
  const email = normalizeEmail((await c.req.parseBody()).email)
  if (!email) return redirect('/admin?msg=bad_email')
  await addSubscriber(c.env.DB, email)
  return redirect('/admin?msg=added')
})

adminRoutes.post('/admin/subscribers/:id/:action{activate|deactivate}', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.notFound()
  await setSubscriberActive(c.env.DB, id, c.req.param('action') === 'activate')
  return redirect('/admin?msg=updated')
})
