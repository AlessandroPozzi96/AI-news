import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { createSession, verifySession } from '../src/admin/session'
import { normalizeEmail, parseSettingsForm } from '../src/admin/settings'

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
  const good = { send_day: '5', send_hour: '18', frequency_weeks: '1', items_per_issue: '5', language: 'fr' }

  it('accepts valid settings and rejects out-of-range or malformed ones', () => {
    expect(parseSettingsForm(good)).toMatchObject({ ok: true, values: { sendDay: 5, sendHour: 18 } })
    for (const bad of [
      { send_day: '8' },
      { send_hour: '24' },
      { send_hour: '-1' },
      { frequency_weeks: '0' },
      { items_per_issue: '11' },
      { items_per_issue: '5; DROP' },
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

    const saved = await post(
      '/admin/settings',
      { send_day: '4', send_hour: '9', frequency_weeks: '2', items_per_issue: '10', language: 'en' },
      cookie,
    )
    expect(saved.headers.get('Location')).toBe('/admin?msg=saved')
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'items_per_issue'").first<{ value: string }>()
    expect(row?.value).toBe('10')

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
  })

  it('does not accept a forged session cookie', async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin`, { redirect: 'manual', headers: { Cookie: 'admin_session=9999999999.deadbeef' } })
    expect(res.status).toBe(303)
  })
})
