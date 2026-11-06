import { describe, expect, it } from 'vitest'
import { dispatchNewsletter } from '../src/admin/dispatch'
import { USER_AGENT } from '../src/collect/http'

type Captured = { url: string; init: RequestInit }

const recording = (status: number, body: string | null = null) => {
  const calls: Captured[] = []
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(body, { status })
  }) as unknown as typeof fetch
  return { calls, doFetch }
}

describe('dispatchNewsletter', () => {
  it('posts a force dispatch of the newsletter workflow on master', async () => {
    const { calls, doFetch } = recording(204)
    await dispatchNewsletter(doFetch, 'owner/repo', 'gh-token')

    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe('https://api.github.com/repos/owner/repo/actions/workflows/newsletter.yml/dispatches')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer gh-token')
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBeTruthy()
    expect(headers['User-Agent']).toBe(USER_AGENT)
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'master', inputs: { force: 'true' } })
  })

  it('treats any 2xx answer as success', async () => {
    await expect(dispatchNewsletter(recording(200).doFetch, 'o/r', 't')).resolves.toBeUndefined()
    await expect(dispatchNewsletter(recording(204).doFetch, 'o/r', 't')).resolves.toBeUndefined()
  })

  it('throws on a non-2xx answer without leaking the token', async () => {
    const { doFetch } = recording(401, 'Bad credentials')
    const error = await dispatchNewsletter(doFetch, 'o/r', 'gh-secret-token').catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('401')
    expect((error as Error).message).not.toContain('gh-secret-token')
  })
})
