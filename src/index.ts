import { Hono } from 'hono'
import { webRoutes } from './web/routes'

export type Env = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

app.route('/', webRoutes)

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all()
  return c.json({ app: 'ai-news', settings: results })
})

export default {
  fetch: app.fetch,
  async scheduled() {
    // Pipeline trigger lands in phase 5.
  },
} satisfies ExportedHandler<Env>
