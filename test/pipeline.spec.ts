import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nextManualIssueId } from '../src/issues/store'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../src/mail/token'
import { resendMailer } from '../src/mail/resend'
import { runIfDue, runNow, runPipeline, type PipelineDeps } from '../src/pipeline/run'
import { isDue, weekIdIn } from '../src/pipeline/schedule'
import type { Settings } from '../src/pipeline/settings'
import { candidate, collectorOf, fakeLlm, fakeMailer, longPage, triageOf, writerOk } from './helpers'

const settings: Settings = {
  sendDay: 5,
  sendHour: 18,
  timezone: 'Europe/Paris',
  frequencyWeeks: 1,
  itemsPerIssue: 5,
  language: 'fr',
}
const FRIDAY_1800_SUMMER = new Date('2026-07-10T16:00:00Z') // UTC+2
const FRIDAY_1800_WINTER = new Date('2026-10-30T17:00:00Z') // UTC+1
const NOT_SENT = { currentWeekSent: false, lastSentAt: null }

describe('schedule', () => {
  it('opens at the configured Paris time in both summer and winter time', () => {
    expect(isDue(FRIDAY_1800_SUMMER, settings, NOT_SENT)).toBe(true)
    expect(isDue(FRIDAY_1800_WINTER, settings, NOT_SENT)).toBe(true)
    expect(isDue(new Date('2026-07-10T15:59:00Z'), settings, NOT_SENT)).toBe(false)
    expect(isDue(new Date('2026-10-30T16:59:00Z'), settings, NOT_SENT)).toBe(false)
  })

  it('catches up for 48 hours after a missed hour, then gives up', () => {
    expect(isDue(new Date('2026-10-30T20:00:00Z'), settings, NOT_SENT)).toBe(true)
    expect(isDue(new Date('2026-10-31T17:00:00Z'), settings, NOT_SENT)).toBe(true)
    expect(isDue(new Date('2026-11-01T16:59:00Z'), settings, NOT_SENT)).toBe(true)
    expect(isDue(new Date('2026-11-01T17:00:00Z'), settings, NOT_SENT)).toBe(false)
    expect(isDue(new Date('2026-10-29T17:00:00Z'), settings, NOT_SENT)).toBe(false)
  })

  it('does not run twice in a week and honours the frequency', () => {
    expect(isDue(FRIDAY_1800_WINTER, settings, { currentWeekSent: true, lastSentAt: null })).toBe(false)
    const lastWeek = new Date('2026-10-23T17:05:00Z')
    expect(isDue(FRIDAY_1800_WINTER, settings, { currentWeekSent: false, lastSentAt: lastWeek })).toBe(true)
    expect(isDue(FRIDAY_1800_WINTER, { ...settings, frequencyWeeks: 2 }, { currentWeekSent: false, lastSentAt: lastWeek })).toBe(false)
  })

  it('dates the issue by the local calendar, not UTC', () => {
    // Sunday 23:30 UTC is already Monday in Paris: next ISO week.
    expect(weekIdIn(new Date('2026-11-01T23:30:00Z'), 'Europe/Paris')).toBe('2026-S45')
    expect(weekIdIn(new Date('2026-11-01T23:30:00Z'), 'UTC')).toBe('2026-S44')
  })
})

describe('unsubscribe token', () => {
  it('round-trips and rejects tampering or another secret', async () => {
    const token = await signUnsubscribeToken('s1', 42)
    expect(await verifyUnsubscribeToken('s1', token)).toBe(42)
    expect(await verifyUnsubscribeToken('s2', token)).toBeNull()
    expect(await verifyUnsubscribeToken('s1', token.replace(/^42/, '43'))).toBeNull()
    expect(await verifyUnsubscribeToken('s1', 'garbage')).toBeNull()
    expect(await verifyUnsubscribeToken('s1', '')).toBeNull()
  })
})

describe('resend mailer', () => {
  it('posts a batch with auth, idempotency key and per-recipient messages', async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const doFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }))
    }) as unknown as typeof fetch
    const mailer = resendMailer('re_key', 'News <news@x.test>', doFetch)
    const res = await mailer.sendBatch(
      [
        { to: 'a@x.test', subject: 'S', html: '<p>h</p>', text: 't' },
        { to: 'b@x.test', subject: 'S', html: '<p>h</p>', text: 't', headers: { 'List-Unsubscribe': '<u>' } },
      ],
      'key-1',
    )
    expect(res).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(captured?.url).toBe('https://api.resend.com/emails/batch')
    const headers = captured?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_key')
    expect(headers['Idempotency-Key']).toBe('key-1')
    const body = JSON.parse(captured?.init.body as string)
    expect(body[0]).toMatchObject({ from: 'News <news@x.test>', to: ['a@x.test'] })
    expect(body[1].headers).toEqual({ 'List-Unsubscribe': '<u>' })
  })

  it('throws on HTTP errors and oversized batches', async () => {
    const bad = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch
    await expect(resendMailer('k', 'f', bad).sendBatch([{ to: 'a', subject: 's', html: 'h', text: 't' }], 'k')).rejects.toThrow('Resend HTTP 403')
    const many = Array.from({ length: 101 }, () => ({ to: 'a', subject: 's', html: 'h', text: 't' }))
    await expect(resendMailer('k', 'f', bad).sendBatch(many, 'k')).rejects.toThrow('limited')
  })
})

const BASE = 'https://news.test'

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps & { mailer: ReturnType<typeof fakeMailer>; llm: ReturnType<typeof fakeLlm> } {
  return {
    db: env.DB,
    llm: fakeLlm({ triage: triageOf(10), writer: writerOk }),
    fetch: longPage,
    mailer: fakeMailer(),
    now: FRIDAY_1800_WINTER,
    baseUrl: BASE,
    unsubscribeSecret: 'test-secret',
    adminEmail: 'admin@x.test',
    collectors: [collectorOf(Array.from({ length: 12 }, (_, i) => candidate(i)))],
    ...over,
  } as PipelineDeps & { mailer: ReturnType<typeof fakeMailer>; llm: ReturnType<typeof fakeLlm> }
}

async function reset() {
  for (const t of ['deliveries', 'items', 'runs', 'seen_urls', 'issues', 'subscribers']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run()
  }
  await env.DB.prepare("INSERT INTO subscribers (email) VALUES ('a@x.test'), ('b@x.test')").run()
}

describe('pipeline', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })
  beforeEach(reset)

  it('generates, sends one personalised mail per subscriber and marks the issue sent', async () => {
    const d = deps()
    const res = await runPipeline(d)
    expect(res).toMatchObject({ status: 'sent', issueId: '2026-S44', delivered: 2 })
    expect(d.mailer.sent.map((m) => m.to)).toEqual(['a@x.test', 'b@x.test'])

    const mail = d.mailer.sent[0]
    expect(mail.html).toContain(`${BASE}/issue/2026-S44/1`)
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const unsub = mail.headers?.['List-Unsubscribe']?.slice(1, -1) as string
    expect(unsub).toContain(`${BASE}/unsubscribe?token=`)
    expect(d.mailer.sent[1].headers?.['List-Unsubscribe']).not.toBe(mail.headers?.['List-Unsubscribe'])

    const issue = await env.DB.prepare('SELECT status, sent_at FROM issues').first<{ status: string; sent_at: string }>()
    expect(issue?.status).toBe('sent')
    expect(issue?.sent_at).toBeTruthy()
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM seen_urls WHERE published = 1").first<{ n: number }>())?.n).toBe(5)
    const run = await env.DB.prepare('SELECT status, llm_cost_usd FROM runs').first<{ status: string; llm_cost_usd: number }>()
    expect(run?.status).toBe('ok')
    expect(run?.llm_cost_usd).toBeGreaterThan(0)
  })

  it('never sends the same issue twice', async () => {
    const d = deps()
    await runPipeline(d)
    const again = await runPipeline(d)
    expect(again).toMatchObject({ status: 'skipped', reason: 'already sent' })
    expect(d.mailer.sent).toHaveLength(2)
    expect((await runIfDue(d)).status).toBe('skipped')
  })

  it('skips inactive subscribers', async () => {
    await env.DB.prepare("UPDATE subscribers SET active = 0 WHERE email = 'b@x.test'").run()
    const d = deps()
    await runPipeline(d)
    expect(d.mailer.sent.map((m) => m.to)).toEqual(['a@x.test'])
  })

  it('resumes after a partial failure without regenerating or re-sending', async () => {
    const mailer = fakeMailer({ failFor: ['b@x.test'] })
    const d = deps({ mailer })
    await expect(runPipeline(d)).rejects.toThrow('1 delivery(ies) failed')
    // Only a@ got the issue; the admin got the failure alert.
    expect(mailer.sent.map((m) => m.to)).toEqual(['a@x.test', 'admin@x.test'])
    expect((await env.DB.prepare('SELECT status FROM issues').first<{ status: string }>())?.status).toBe('sending')
    // The issue is already reachable by link: recipients who got the mail must not hit a 404.
    expect((await SELF.fetch(`${BASE}/issue/2026-S44/1`)).status).toBe(200)
    const llmCalls = d.llm.calls.length

    mailer.failFor.clear()
    const res = await runPipeline(d)
    expect(res).toMatchObject({ status: 'sent', delivered: 2 })
    expect(mailer.sent.filter((m) => m.to === 'a@x.test' && m.subject.startsWith('Dev Agents'))).toHaveLength(1)
    expect(mailer.sent.filter((m) => m.to === 'b@x.test')).toHaveLength(1)
    expect(d.llm.calls.length).toBe(llmCalls)
  })

  it('refuses to send an issue with fewer than 3 relevant items and stores nothing', async () => {
    const two = () => ({
      picks: [
        { id: 0, category: 'other', score: 9, claude_code_related: true },
        { id: 1, category: 'other', score: 8, claude_code_related: false },
      ],
    })
    const d = deps({ llm: fakeLlm({ triage: two, writer: writerOk }) })
    await expect(runPipeline(d)).rejects.toThrow('Only 2 relevant item(s)')
    expect(d.mailer.sent.filter((m) => m.to === 'a@x.test')).toHaveLength(0)
  })

  it('accepts a shorter issue when the configured size is below the minimum', async () => {
    await env.DB.prepare("UPDATE settings SET value = '2' WHERE key = 'items_per_issue'").run()
    try {
      const two = () => ({
        picks: [
          { id: 0, category: 'other', score: 9, claude_code_related: true },
          { id: 1, category: 'other', score: 8, claude_code_related: false },
        ],
      })
      const d = deps({ llm: fakeLlm({ triage: two, writer: writerOk }) })
      expect(await runPipeline(d)).toMatchObject({ status: 'sent' })
    } finally {
      await env.DB.prepare("UPDATE settings SET value = '5' WHERE key = 'items_per_issue'").run()
    }
  })

  it('alerts the admin on failure and records the run', async () => {
    const d = deps({ llm: fakeLlm({ triage: () => ({ picks: [] }), writer: writerOk }) })
    await expect(runPipeline(d)).rejects.toThrow('No item could be generated')
    const alert = d.mailer.sent.find((m) => m.to === 'admin@x.test')
    expect(alert?.subject).toContain('Pipeline failed for 2026-S44')
    expect(alert?.text).toContain('No item could be generated')
    const run = await env.DB.prepare('SELECT status, error FROM runs').first<{ status: string; error: string }>()
    expect(run?.status).toBe('failed')
    expect(run?.error).toContain('nothing to send')
  })

  it('does not let a failing alert mask the real error', async () => {
    const mailer = fakeMailer({ throwOnce: true })
    const d = deps({ mailer, llm: fakeLlm({ triage: () => ({ picks: [] }), writer: writerOk }) })
    await expect(runPipeline(d)).rejects.toThrow('No item could be generated')
  })

  it('stops automatic retries after repeated failures but still allows a manual run', async () => {
    const bad = fakeLlm({ triage: () => ({ picks: [] }), writer: writerOk })
    for (let i = 0; i < 3; i++) await expect(runIfDue(deps({ llm: bad }))).rejects.toThrow()
    const stopped = await runIfDue(deps({ llm: bad }))
    expect(stopped).toMatchObject({ status: 'skipped', reason: expect.stringContaining('too many failed attempts') })
    expect((await runPipeline(deps())).status).toBe('sent')
  })

  it('ignores a run that is already in progress', async () => {
    await env.DB.prepare("INSERT INTO runs (issue_id, status) VALUES ('2026-S44', 'running')").run()
    const res = await runPipeline(deps())
    expect(res).toMatchObject({ status: 'skipped', reason: 'another run is in progress' })
  })

  it('only runs from the cron when the send window is open', async () => {
    const d = deps({ now: new Date('2026-10-28T10:00:00Z') })
    expect(await runIfDue(d)).toMatchObject({ status: 'skipped', reason: 'not due' })
    expect(d.mailer.sent).toHaveLength(0)
    expect((await runIfDue(deps())).status).toBe('sent')
  })
})

describe('nextManualIssueId', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })
  beforeEach(reset)

  const seed = (id: string) => env.DB.prepare("INSERT INTO issues (id, language, status) VALUES (?, 'fr', 'sent')").bind(id).run()

  it('orders suffixes numerically, so -10 follows -9', async () => {
    await seed('2026-S45-9')
    expect(await nextManualIssueId(env.DB, '2026-S45')).toBe('2026-S45-10')
    await seed('2026-S45-10')
    expect(await nextManualIssueId(env.DB, '2026-S45')).toBe('2026-S45-11')
  })

  it('ignores ids that are not manual issues of that week', async () => {
    await seed('2026-S45')
    await seed('2026-S45-2abc')
    await seed('2026-S46-7')
    expect(await nextManualIssueId(env.DB, '2026-S45')).toBe('2026-S45-2')
  })
})

describe('manual send (runNow)', () => {
  const WEDNESDAY_S45 = new Date('2026-11-04T10:00:00Z') // ISO week 45 in Paris
  const FRIDAY_S45 = new Date('2026-11-06T17:00:00Z') // 18:00 in Paris

  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })
  beforeEach(reset)

  const issueIds = async () =>
    (await env.DB.prepare('SELECT id FROM issues ORDER BY id').all<{ id: string }>()).results.map((r) => r.id)

  it('creates -2 when the automatic issue of the week is already sent', async () => {
    await runPipeline(deps({ now: WEDNESDAY_S45 }))
    const res = await runNow(deps({ now: WEDNESDAY_S45 }))
    expect(res).toMatchObject({ status: 'sent', issueId: '2026-S45-2', delivered: 2 })
    expect(await issueIds()).toEqual(['2026-S45', '2026-S45-2'])
  })

  it('creates -3 for the next manual send', async () => {
    await runPipeline(deps({ now: WEDNESDAY_S45 }))
    await runNow(deps({ now: WEDNESDAY_S45 }))
    const res = await runNow(deps({ now: WEDNESDAY_S45, collectors: [collectorOf(Array.from({ length: 12 }, (_, i) => candidate(i + 50)))] }))
    expect(res).toMatchObject({ status: 'sent', issueId: '2026-S45-3' })
  })

  it('starts at -2 when no automatic issue exists this week', async () => {
    expect(await runNow(deps({ now: WEDNESDAY_S45 }))).toMatchObject({ status: 'sent', issueId: '2026-S45-2' })
  })

  it('resumes an unsent manual issue without LLM calls or duplicate mail', async () => {
    const mailer = fakeMailer({ failFor: ['b@x.test'] })
    const d = deps({ now: WEDNESDAY_S45, mailer })
    await expect(runNow(d)).rejects.toThrow('1 delivery(ies) failed')
    expect(mailer.sent.map((m) => m.to)).toEqual(['a@x.test', 'admin@x.test'])
    const llmCalls = d.llm.calls.length

    mailer.failFor.clear()
    expect(await runNow(d)).toMatchObject({ status: 'sent', issueId: '2026-S45-2', delivered: 2 })
    expect(d.llm.calls.length).toBe(llmCalls)
    expect(mailer.sent.filter((m) => m.to === 'a@x.test')).toHaveLength(1)
    expect(mailer.sent.filter((m) => m.to === 'b@x.test')).toHaveLength(1)
    expect(await issueIds()).toEqual(['2026-S45-2'])
  })

  it('sends an issue with a single item', async () => {
    const d = deps({ now: WEDNESDAY_S45, llm: fakeLlm({ triage: triageOf(1), writer: writerOk }) })
    expect(await runNow(d)).toMatchObject({ status: 'sent', issueId: '2026-S45-2', delivered: 2 })
  })

  it('fails with the usual alert when no item can be generated', async () => {
    const d = deps({ now: WEDNESDAY_S45, llm: fakeLlm({ triage: () => ({ picks: [] }), writer: writerOk }) })
    await expect(runNow(d)).rejects.toThrow('No item could be generated')
    expect(d.mailer.sent.find((m) => m.to === 'admin@x.test')?.subject).toContain('Pipeline failed for 2026-S45-2')
    expect(d.mailer.sent.filter((m) => m.to === 'a@x.test')).toHaveLength(0)
  })

  it('serves the manual issue on public pages', async () => {
    await runNow(deps({ now: WEDNESDAY_S45 }))
    expect((await SELF.fetch(`${BASE}/issue/2026-S45-2`)).status).toBe(200)
    expect((await SELF.fetch(`${BASE}/issue/2026-S45-2/1`)).status).toBe(200)
    expect((await SELF.fetch(`${BASE}/issue/2026-S45-9`)).status).toBe(404)
  })

  it('leaves the automatic Friday send in place after a manual send in the same week', async () => {
    await runNow(deps({ now: WEDNESDAY_S45 }))
    // The manual send is recent: it must not count towards the one-week frequency gap.
    await env.DB.prepare("UPDATE issues SET sent_at = '2026-11-04 10:00:00' WHERE id = '2026-S45-2'").run()
    const friday = deps({ now: FRIDAY_S45, collectors: [collectorOf(Array.from({ length: 12 }, (_, i) => candidate(i + 100)))] })
    expect(await runIfDue(friday)).toMatchObject({ status: 'sent', issueId: '2026-S45' })
    expect(await issueIds()).toEqual(['2026-S45', '2026-S45-2'])
  })
})

describe('unsubscribe routes', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })
  beforeEach(reset)

  const idOf = async (email: string) =>
    (await env.DB.prepare('SELECT id FROM subscribers WHERE email = ?').bind(email).first<{ id: number }>())?.id as number

  it('GET only asks for confirmation and does not unsubscribe', async () => {
    const token = await signUnsubscribeToken('test-secret', await idOf('a@x.test'))
    const res = await SELF.fetch(`${BASE}/unsubscribe?token=${token}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<form method="post"')
    expect((await env.DB.prepare("SELECT active FROM subscribers WHERE email = 'a@x.test'").first<{ active: number }>())?.active).toBe(1)
  })

  it('POST unsubscribes only the token owner, and is idempotent', async () => {
    const token = await signUnsubscribeToken('test-secret', await idOf('a@x.test'))
    const res = await SELF.fetch(`${BASE}/unsubscribe?token=${token}`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect((await env.DB.prepare("SELECT active FROM subscribers WHERE email = 'a@x.test'").first<{ active: number }>())?.active).toBe(0)
    expect((await env.DB.prepare("SELECT active FROM subscribers WHERE email = 'b@x.test'").first<{ active: number }>())?.active).toBe(1)
    expect((await SELF.fetch(`${BASE}/unsubscribe?token=${token}`, { method: 'POST' })).status).toBe(200)
  })

  it('rejects forged or missing tokens', async () => {
    const forged = await signUnsubscribeToken('other-secret', await idOf('a@x.test'))
    expect((await SELF.fetch(`${BASE}/unsubscribe?token=${forged}`, { method: 'POST' })).status).toBe(400)
    expect((await SELF.fetch(`${BASE}/unsubscribe`, { method: 'POST' })).status).toBe(400)
    expect((await SELF.fetch(`${BASE}/unsubscribe?token=x`)).status).toBe(400)
    expect((await env.DB.prepare("SELECT active FROM subscribers WHERE email = 'a@x.test'").first<{ active: number }>())?.active).toBe(1)
  })
})
