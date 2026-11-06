import { collectAll } from '../collect/collect'
import { loadSeenUrls, markUrlsSeen } from '../collect/seen'
import { COLLECTORS } from '../collect/sources'
import type { Collector } from '../collect/types'
import { generateIssue, MIN_RELEVANCE_SCORE } from '../generate/issue'
import {
  getIssue,
  latestManualIssue,
  nextManualIssueId,
  saveIssue,
  setIssueStatus,
  type StoredIssue,
} from '../issues/store'
import type { Llm } from '../llm/types'
import { BATCH_SIZE } from '../mail/resend'
import { signUnsubscribeToken } from '../mail/token'
import type { MailMessage, Mailer } from '../mail/types'
import { renderEmail } from '../render/email'
import type { RenderIssue } from '../render/shared'
import { linksFor } from '../web/routes'
import { isDue, weekIdIn } from './schedule'
import { loadSettings, type Settings } from './settings'

export type PipelineDeps = {
  db: D1Database
  llm: Llm
  fetch: typeof fetch
  mailer: Mailer
  now: Date
  /** Public origin of the site, used in e-mail links. */
  baseUrl: string
  unsubscribeSecret: string
  adminEmail?: string
  githubToken?: string
  collectors?: Collector[]
}

export type PipelineResult =
  | { status: 'skipped'; issueId: string; reason: string }
  | { status: 'sent'; issueId: string; delivered: number; costUsd: number }

const RUN_LOCK_MINUTES = 30
const MIN_ITEMS = 3

/** Cron entry point: runs the pipeline only when the configured send window is open. */
export async function runIfDue(deps: PipelineDeps): Promise<PipelineResult> {
  const settings = await loadSettings(deps.db)
  const issueId = weekIdIn(deps.now, settings.timezone)
  const current = await getIssue(deps.db, issueId)
  // Manual issues (`2026-S45-2`) are ignored: they must not delay the automatic send.
  const last = await deps.db
    .prepare("SELECT sent_at FROM issues WHERE status = 'sent' AND id GLOB '????-S??' ORDER BY sent_at DESC LIMIT 1")
    .first<{ sent_at: string }>()
  const lastSentAt = last ? new Date(`${last.sent_at.replace(' ', 'T')}Z`) : null
  const due = isDue(deps.now, settings, { currentWeekSent: current?.status === 'sent', lastSentAt })
  if (!due) return { status: 'skipped', issueId, reason: 'not due' }
  // Automatic retries stop after a few failures so a persistent problem cannot burn LLM credit hourly;
  // an admin can still force a run.
  if ((await failedRuns(deps.db, issueId)) >= MAX_AUTO_ATTEMPTS) {
    return { status: 'skipped', issueId, reason: 'too many failed attempts, manual run required' }
  }
  return runPipeline(deps)
}

const MAX_AUTO_ATTEMPTS = 3

async function failedRuns(db: D1Database, issueId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM runs WHERE issue_id = ? AND status = 'failed'")
    .bind(issueId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/** Automatic issue of the current week: generates (if needed) and sends it. Safe to call again after a failure. */
export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const settings = await loadSettings(deps.db)
  const issueId = weekIdIn(deps.now, settings.timezone)
  return runIssue(deps, settings, issueId, { minItems: MIN_ITEMS, requireClaudeCode: true })
}

/**
 * Manual send ("Envoyer maintenant"), ignoring the schedule. Resumes the latest manual issue of the week
 * when it was not fully sent, otherwise creates the next manual id. The automatic issue is never touched.
 */
export async function runNow(deps: PipelineDeps): Promise<PipelineResult> {
  const settings = await loadSettings(deps.db)
  const week = weekIdIn(deps.now, settings.timezone)
  const latest = await latestManualIssue(deps.db, week)
  const issueId = latest && latest.status !== 'sent' ? latest.id : await nextManualIssueId(deps.db, week)
  return runIssue(deps, settings, issueId, { minItems: 1, requireClaudeCode: false })
}

type SendRule = { minItems: number; requireClaudeCode: boolean }

async function runIssue(deps: PipelineDeps, settings: Settings, issueId: string, rule: SendRule): Promise<PipelineResult> {
  const existing = await getIssue(deps.db, issueId)
  if (existing?.status === 'sent') return { status: 'skipped', issueId, reason: 'already sent' }

  const running = await deps.db
    .prepare(
      `SELECT id FROM runs WHERE issue_id = ? AND status = 'running'
       AND started_at > datetime('now', '-${RUN_LOCK_MINUTES} minutes')`,
    )
    .bind(issueId)
    .first()
  if (running) return { status: 'skipped', issueId, reason: 'another run is in progress' }

  const run = await deps.db
    .prepare("INSERT INTO runs (issue_id, status) VALUES (?, 'running') RETURNING id")
    .bind(issueId)
    .first<{ id: number }>()
  const runId = run?.id as number

  let costUsd = 0
  try {
    let issue: StoredIssue | null = existing
    // A previous run may have generated the issue but failed while sending: never pay for it twice.
    if (!issue || issue.items.length === 0) {
      const since = new Date(deps.now.getTime() - 7 * 86_400_000)
      const seen = await loadSeenUrls(deps.db)
      const collected = await collectAll(
        deps.collectors ?? COLLECTORS,
        { since, fetch: deps.fetch, githubToken: deps.githubToken },
        seen,
      )
      const generated = await generateIssue({ llm: deps.llm, fetch: deps.fetch }, collected.candidates, {
        language: settings.language,
        minScore: MIN_RELEVANCE_SCORE,
      })
      costUsd = generated.costUsd
      if (generated.items.length === 0) throw new Error('No item could be generated, nothing to send')
      const claudeCode = generated.items.filter((i) => i.claudeCode).length
      if (generated.items.length < rule.minItems || (rule.requireClaudeCode && claudeCode === 0)) {
        throw new Error(
          `Only ${generated.items.length} item(s) generated (${claudeCode} Claude Code), at least ${rule.minItems}${rule.requireClaudeCode ? ' with one Claude Code item' : ''} required: nothing to send`,
        )
      }
      await saveIssue(deps.db, issueId, settings.language, generated.items)
      await markUrlsSeen(deps.db, generated.consumedUrls, true)
      issue = await getIssue(deps.db, issueId)
      if (!issue) throw new Error('Issue was not saved')
    }

    await setIssueStatus(deps.db, issueId, 'sending')
    const delivered = await deliver(deps, issue, issueId)
    await setIssueStatus(deps.db, issueId, 'sent')
    await finishRun(deps.db, runId, 'ok', null, costUsd)
    return { status: 'sent', issueId, delivered, costUsd }
  } catch (e) {
    const message = (e as Error).message
    await finishRun(deps.db, runId, 'failed', message, costUsd)
    // Hourly retries would otherwise mail the admin every hour: alert on the first failure, then every 6th.
    const failures = await failedRuns(deps.db, issueId)
    if (failures === 1 || failures % 6 === 0) await alertAdmin(deps, issueId, message)
    throw e
  }
}

async function deliver(deps: PipelineDeps, issue: StoredIssue, issueId: string): Promise<number> {
  const { results: subscribers } = await deps.db
    .prepare('SELECT id, email FROM subscribers WHERE active = 1 ORDER BY id')
    .all<{ id: number; email: string }>()
  const { results: done } = await deps.db
    .prepare("SELECT subscriber_id FROM deliveries WHERE issue_id = ? AND status = 'sent'")
    .bind(issueId)
    .all<{ subscriber_id: number }>()
  const already = new Set(done.map((d) => d.subscriber_id))
  const pending = subscribers.filter((s) => !already.has(s.id))

  const renderIssue: RenderIssue = { id: issue.id, language: issue.language, items: issue.items, date: deps.now }
  const links = linksFor(issueId, deps.baseUrl)
  let delivered = already.size
  let failed = 0

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE)
    const messages: MailMessage[] = await Promise.all(
      chunk.map(async (s) => {
        const unsubscribe = `${links.unsubscribe}?token=${await signUnsubscribeToken(deps.unsubscribeSecret, s.id)}`
        const mail = renderEmail(renderIssue, { ...links, unsubscribe })
        return {
          to: s.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }
      }),
    )
    let results: Awaited<ReturnType<Mailer['sendBatch']>>
    try {
      results = await deps.mailer.sendBatch(messages, `${issueId}-${chunk[0].id}`)
    } catch (e) {
      results = chunk.map(() => ({ error: (e as Error).message }))
    }
    const record = deps.db.prepare(
      `INSERT INTO deliveries (issue_id, subscriber_id, status, provider_id, error) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (issue_id, subscriber_id) DO UPDATE SET status = excluded.status,
       provider_id = excluded.provider_id, error = excluded.error, updated_at = datetime('now')`,
    )
    await deps.db.batch(
      chunk.map((s, j) =>
        record.bind(issueId, s.id, results[j]?.id ? 'sent' : 'failed', results[j]?.id ?? null, results[j]?.error ?? null),
      ),
    )
    for (const r of results) {
      if (r.id) delivered++
      else failed++
    }
  }

  if (failed > 0) throw new Error(`${failed} delivery(ies) failed for issue ${issueId}; ${delivered} sent`)
  return delivered
}

async function finishRun(db: D1Database, id: number, status: 'ok' | 'failed', error: string | null, cost: number) {
  await db
    .prepare("UPDATE runs SET status = ?, error = ?, llm_cost_usd = ?, finished_at = datetime('now') WHERE id = ?")
    .bind(status, error, cost, id)
    .run()
}

async function alertAdmin(deps: PipelineDeps, issueId: string, error: string): Promise<void> {
  if (!deps.adminEmail) return
  try {
    await deps.mailer.sendBatch(
      [
        {
          to: deps.adminEmail,
          subject: `[Dev Agents Weekly] Pipeline failed for ${issueId}`,
          text: `The weekly pipeline failed for ${issueId}.\n\nError: ${error}\n\nIt retries on the next hourly run while the send window is open.`,
          html: `<p>The weekly pipeline failed for <b>${issueId}</b>.</p><pre>${error.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre><p>It retries on the next hourly run while the send window is open.</p>`,
        },
      ],
      `alert-${issueId}-${Date.now()}`,
    )
  } catch {
    // An alert failure must never mask the original error.
  }
}
