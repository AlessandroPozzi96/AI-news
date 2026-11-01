import { Hono } from 'hono'
import type { Env } from './env'
import { anthropicLlm } from './llm/anthropic'
import { resendMailer } from './mail/resend'
import { runIfDue, type PipelineDeps } from './pipeline/run'
import { unsubscribeRoutes } from './web/unsubscribe'
import { webRoutes } from './web/routes'

export type { Env }

const app = new Hono<{ Bindings: Env }>()

app.route('/', webRoutes)
app.route('/', unsubscribeRoutes)

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all()
  return c.json({ app: 'ai-news', settings: results })
})

function pipelineDeps(env: Env): PipelineDeps {
  return {
    db: env.DB,
    llm: anthropicLlm(env.ANTHROPIC_API_KEY),
    fetch,
    mailer: resendMailer(env.RESEND_API_KEY, env.MAIL_FROM),
    now: new Date(),
    baseUrl: env.PUBLIC_BASE_URL,
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET,
    adminEmail: env.ADMIN_EMAIL,
    githubToken: env.GITHUB_TOKEN,
  }
}

export default {
  fetch: app.fetch,
  // Hourly trigger: the pipeline itself decides whether the configured send window is open.
  async scheduled(_controller, env) {
    await runIfDue(pipelineDeps(env))
  },
} satisfies ExportedHandler<Env>
