import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSession, verifySession } from '../src/admin/session'
import { normalizeEmail, parseSettingsForm } from '../src/admin/settings'
import { adminRoutes } from '../src/web/admin'

const ORIGIN = 'https://x.test'

describe('session', () => {
  it('accepts a fresh session, rejects tampering, expiry and a different token', async () => {
    const s = await createSession('a-long-admin-token', 1_000_000)
    expect(await verifySession('a-long-admin-token', s, 1_000_000)).toBe(true)
    expect(await verifySession('another-admin-token!', s, 1_000_000)).toBe(false)
    expect(await verifySession('a-long-admin-token', s.replace(/.$/, 'x'), 1_000_000)).toBe(false)
    expect(await verifySession('a-long-admin-token', s, 1_000_000 + 8 * 24 * 3600 * 1000)).toBe(false)
    expect(await verifySession('a-long-admin-token', undefined)).toBe(false)
    expect(await verifySession('a-long-admin-token', 'junk')).toBe(false)
  })
})

describe('validation', () => {
  const good = { send_day: '5', send_hour: '18', frequency_weeks: '1', language: 'fr' }

  it('accepts valid settings and rejects out-of-range or malformed ones', () => {
    expect(parseSettingsForm(good)).toMatchObject({ ok: true, values: { sendDay: 5, sendHour: 18 } })
    expect(parseSettingsForm(good)).toMatchObject({ ok: true, values: { frequencyWeeks: 1, language: 'fr' } })
    for (const bad of [
      { send_day: '8' },
      { send_hour: '24' },
      { send_hour: '-1' },
      { frequency_weeks: '0' },
      { language: 'de' },
    ]) {
      expect(parseSettingsForm({ ...good, ...bad }).ok).toBe(false)
    }
  })

  it('normalizes emails and rejects junk', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com')
    for (const bad of ['', 'no-at', 'a@b', 'a b@c.d', '"x"@c.d', 'a@b.c,d@e.f', 42]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })
})

describe('admin routes', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })

  const post = (path: string, body: Record<string, string>, cookie?: string, origin: string | null = ORIGIN) =>
    SELF.fetch(`${ORIGIN}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(origin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: new URLSearchParams(body),
    })

  async function login(): Promise<string> {
    const res = await post('/admin/login', { token: env.ADMIN_TOKEN })
    expect(res.status).toBe(303)
    const cookie = res.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    return cookie.split(';')[0]
  }

  it('redirects anonymous visitors to the login page', async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin`, { redirect: 'manual' })
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/admin/login')
  })

  it('rejects a wrong token and cross-origin posts', async () => {
    expect((await post('/admin/login', { token: 'wrong' })).status).toBe(401)
    expect((await post('/admin/login', { token: env.ADMIN_TOKEN }, undefined, 'https://evil.test')).status).toBe(403)
    expect((await post('/admin/login', { token: env.ADMIN_TOKEN }, undefined, null)).status).toBe(403)
    expect((await post('/admin/login', { token: env.ADMIN_TOKEN }, undefined, 'null')).status).toBe(403)
  })

  it('accepts a same-origin post whose browser omitted the Origin header, and rejects other fetch sites', async () => {
    // Browsers drop Origin on same-origin POSTs under some referrer policies; Sec-Fetch-Site is the fallback signal.
    const withSite = (site: string, origin?: string) =>
      SELF.fetch(`${ORIGIN}/admin/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Sec-Fetch-Site': site,
          ...(origin ? { Origin: origin } : {}),
        },
        body: new URLSearchParams({ token: env.ADMIN_TOKEN }),
      })
    expect((await withSite('same-origin')).status).toBe(303)
    expect((await withSite('same-origin', 'null')).status).toBe(303)
    expect((await withSite('cross-site')).status).toBe(403)
    expect((await withSite('same-site')).status).toBe(403)
    expect((await withSite('same-origin', 'https://evil.test')).status).toBe(403)
  })

  it('keeps the Origin header on same-origin posts by using a same-origin referrer policy', async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/login`)
    expect(res.headers.get('Referrer-Policy')).toBe('same-origin')
  })

  it('saves settings and manages subscribers once logged in', async () => {
    const cookie = await login()

    const saved = await post('/admin/settings', { send_day: '4', send_hour: '9', frequency_weeks: '2', language: 'en' }, cookie)
    expect(saved.headers.get('Location')).toBe('/admin?msg=saved')
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'send_hour'").first<{ value: string }>()
    expect(row?.value).toBe('9')

    const invalid = await post('/admin/settings', { send_day: '9' }, cookie)
    expect(invalid.headers.get('Location')).toBe('/admin?msg=bad_settings')

    await post('/admin/subscribers', { email: 'Reader@Example.com' }, cookie)
    expect((await post('/admin/subscribers', { email: 'nope' }, cookie)).headers.get('Location')).toBe('/admin?msg=bad_email')
    const sub = await env.DB.prepare('SELECT id, active FROM subscribers WHERE email = ?').bind('reader@example.com').first<{ id: number; active: number }>()
    expect(sub?.active).toBe(1)

    await post(`/admin/subscribers/${sub?.id}/deactivate`, {}, cookie)
    const off = await env.DB.prepare('SELECT active, unsubscribed_at FROM subscribers WHERE id = ?').bind(sub?.id).first<{ active: number; unsubscribed_at: string | null }>()
    expect(off?.active).toBe(0)
    expect(off?.unsubscribed_at).not.toBeNull()

    await post('/admin/subscribers', { email: 'reader@example.com' }, cookie)
    const back = await env.DB.prepare('SELECT active, unsubscribed_at FROM subscribers WHERE id = ?').bind(sub?.id).first<{ active: number; unsubscribed_at: string | null }>()
    expect(back).toEqual({ active: 1, unsubscribed_at: null })

    const page = await SELF.fetch(`${ORIGIN}/admin?msg=saved`, { headers: { Cookie: cookie } })
    expect(page.status).toBe(200)
    expect(page.headers.get('Cache-Control')).toBe('no-store')
    const body = await page.text()
    expect(body).toContain('reader@example.com')
    expect(body).toContain('Réglages enregistrés.')
    expect(body).not.toContain('items_per_issue')
    expect(body).not.toContain('Articles par numéro')
  })

  it('shows the send-now button on the dashboard', async () => {
    const cookie = await login()
    const body = await (await SELF.fetch(`${ORIGIN}/admin`, { headers: { Cookie: cookie } })).text()
    expect(body).toContain('Envoyer maintenant')
    expect(body).toContain('action="/admin/send-now"')
  })

  it('send-now requires a session', async () => {
    const res = await post('/admin/send-now', {})
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/admin/login')
  })

  it('send-now rejects cross-origin posts', async () => {
    const cookie = await login()
    expect((await post('/admin/send-now', {}, cookie, 'https://evil.test')).status).toBe(403)
  })

  describe('send-now with GitHub configured', () => {
    afterEach(() => vi.unstubAllGlobals())

    const send = async (over: Record<string, string | undefined> = {}) =>
      adminRoutes.request(
        `${ORIGIN}/admin/send-now`,
        { method: 'POST', headers: { Origin: ORIGIN, Cookie: await login() } },
        { ...env, GH_DISPATCH_TOKEN: 'test-dispatch-token', GITHUB_REPO: 'owner/repo', ...over },
      )

    it('reports a started send when GitHub accepts', async () => {
      vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }))
      expect((await send()).headers.get('Location')).toBe('/admin?msg=send_started')
    })

    it('reports a failure when GitHub refuses', async () => {
      vi.stubGlobal('fetch', async () => new Response('nope', { status: 403 }))
      expect((await send()).headers.get('Location')).toBe('/admin?msg=send_failed')
    })

    it('reports a failure when the request itself fails', async () => {
      vi.stubGlobal('fetch', async () => {
        throw new Error('network down')
      })
      expect((await send()).headers.get('Location')).toBe('/admin?msg=send_failed')
    })

    it('reports a missing repository like a missing token', async () => {
      expect((await send({ GITHUB_REPO: undefined })).headers.get('Location')).toBe('/admin?msg=send_unconfigured')
    })
  })

  it('send-now reports when the GitHub token is not configured', async () => {
    const cookie = await login()
    const res = await post('/admin/send-now', {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/admin?msg=send_unconfigured')
  })

  it('does not accept a forged session cookie', async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin`, { redirect: 'manual', headers: { Cookie: 'admin_session=9999999999.deadbeef' } })
    expect(res.status).toBe(303)
  })
})
