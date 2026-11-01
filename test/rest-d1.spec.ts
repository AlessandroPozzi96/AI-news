import { describe, expect, it } from 'vitest'
import { restD1 } from '../src/db/rest-d1'

type Call = { url: string; init: RequestInit; body: unknown }

function fakeApi(responder: (body: unknown) => { status?: number; json: unknown }) {
  const calls: Call[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    calls.push({ url, init, body })
    const { status = 200, json } = responder(body)
    return new Response(JSON.stringify(json), { status })
  }) as unknown as typeof fetch
  const db = restD1({ accountId: 'acc', databaseId: 'db1', token: 'tok', fetch: fetchFn })
  return { db, calls }
}

const ok = (results: unknown[][]) => ({
  json: { success: true, result: results.map((r) => ({ success: true, results: r, meta: {} })) },
})

describe('restD1', () => {
  it('sends a single query with auth, params and null handling', async () => {
    const { db, calls } = fakeApi(() => ok([[{ id: 7 }]]))
    const row = await db.prepare('SELECT id FROM t WHERE a = ? AND b = ? AND c = ?').bind('x', undefined, true).first<{ id: number }>()
    expect(row).toEqual({ id: 7 })
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db1/query')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(calls[0].body).toEqual({ sql: 'SELECT id FROM t WHERE a = ? AND b = ? AND c = ?', params: ['x', null, 1] })
  })

  it('returns null for no row and an empty list for all()', async () => {
    const { db } = fakeApi(() => ok([[]]))
    expect(await db.prepare('SELECT 1').first()).toBeNull()
    expect((await db.prepare('SELECT 1').all()).results).toEqual([])
  })

  it('sends batches as one request and returns one result per statement', async () => {
    const { db, calls } = fakeApi(() => ok([[], [{ n: 2 }]]))
    const stmt = db.prepare('INSERT INTO t VALUES (?)')
    const out = await db.batch([stmt.bind(1), db.prepare('SELECT 2 AS n')])
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({
      batch: [
        { sql: 'INSERT INTO t VALUES (?)', params: [1] },
        { sql: 'SELECT 2 AS n', params: [] },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[1].results).toEqual([{ n: 2 }])
  })

  it('does not call the API for an empty batch', async () => {
    const { db, calls } = fakeApi(() => ok([]))
    expect(await db.batch([])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('surfaces API errors and failed statements', async () => {
    const denied = fakeApi(() => ({ status: 403, json: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } }))
    await expect(denied.db.prepare('SELECT 1').first()).rejects.toThrow('Authentication error')

    const failed = fakeApi(() => ({ json: { success: true, result: [{ success: false }] } }))
    await expect(failed.db.prepare('SELECT 1').first()).rejects.toThrow('statement failed')
  })
})
