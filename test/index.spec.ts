import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('GET /', () => {
  it('answers without exposing configuration', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Dev Agents Weekly')
  })
})
