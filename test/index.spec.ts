import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GET /', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })

  it('returns the default settings', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings: { key: string; value: string }[] }
    expect(body.settings).toContainEqual({ key: 'send_day', value: '5' })
    expect(body.settings).toContainEqual({ key: 'language', value: 'fr' })
  })
})
