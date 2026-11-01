import { Hono } from 'hono'
import type { Env } from './env'
import { unsubscribeRoutes } from './web/unsubscribe'
import { webRoutes } from './web/routes'

export type { Env }

// The Worker only serves the web side. The weekly pipeline runs on GitHub Actions (scripts/pipeline.ts):
// Cloudflare's free plan allows 10 ms of CPU per invocation, far below what collecting and parsing needs.
const app = new Hono<{ Bindings: Env }>()

app.route('/', webRoutes)
app.route('/', unsubscribeRoutes)

app.get('/', (c) => c.text('Dev Agents Weekly'))

export default app
