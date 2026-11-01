import { restD1 } from '../src/db/rest-d1'
import { anthropicLlm } from '../src/llm/anthropic'
import { resendMailer } from '../src/mail/resend'
import { runIfDue, runPipeline, type PipelineDeps } from '../src/pipeline/run'

const REQUIRED = [
  'CF_ACCOUNT_ID',
  'CF_API_TOKEN',
  'D1_DATABASE_ID',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'UNSUBSCRIBE_SECRET',
  'PUBLIC_BASE_URL',
  'MAIL_FROM',
] as const

const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`)
  process.exit(1)
}
const env = process.env as Record<(typeof REQUIRED)[number], string> & Record<string, string | undefined>

const force = process.argv.includes('--force')

const deps: PipelineDeps = {
  db: restD1({ accountId: env.CF_ACCOUNT_ID, databaseId: env.D1_DATABASE_ID, token: env.CF_API_TOKEN }),
  llm: anthropicLlm(env.ANTHROPIC_API_KEY),
  fetch,
  mailer: resendMailer(env.RESEND_API_KEY, env.MAIL_FROM),
  now: new Date(),
  baseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''),
  unsubscribeSecret: env.UNSUBSCRIBE_SECRET,
  adminEmail: env.ADMIN_EMAIL || undefined,
  githubToken: env.GITHUB_TOKEN || undefined,
}

try {
  // `--force` skips the schedule check (manual "send now"), but still never re-sends a sent issue.
  const result = force ? await runPipeline(deps) : await runIfDue(deps)
  console.log(JSON.stringify(result))
} catch (e) {
  // A non-zero exit makes the GitHub run fail visibly (and GitHub e-mails the repo owner about it).
  console.error(`Pipeline failed: ${(e as Error).message}`)
  process.exit(1)
}
