/**
 * Minimal D1Database look-alike over Cloudflare's REST API, so the pipeline (which runs outside
 * Cloudflare, on GitHub Actions) can use the same code and queries as the Worker.
 * Only the subset the app uses is implemented: prepare/bind/first/all/run and batch.
 */

type Param = string | number | boolean | null | undefined

type Row = Record<string, unknown>
type QueryResult = { results?: Row[]; success: boolean; meta?: Record<string, unknown> }
type ApiResponse = {
  success: boolean
  result?: QueryResult[]
  errors?: { code: number; message: string }[]
}

export type RestD1Options = {
  accountId: string
  databaseId: string
  token: string
  fetch?: typeof fetch
}

const clean = (p: Param): string | number | null => (p === undefined || p === null ? null : typeof p === 'boolean' ? Number(p) : p)

class RestStatement {
  constructor(
    private readonly client: RestClient,
    readonly sql: string,
    readonly params: Param[] = [],
  ) {}

  bind(...params: Param[]): RestStatement {
    return new RestStatement(this.client, this.sql, params)
  }

  async all<T = Row>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
    const [res] = await this.client.query([this])
    return { results: (res.results ?? []) as T[], success: res.success, meta: res.meta ?? {} }
  }

  async first<T = Row>(): Promise<T | null> {
    const { results } = await this.all<T>()
    return results[0] ?? null
  }

  async run(): Promise<{ results: Row[]; success: boolean; meta: Record<string, unknown> }> {
    return this.all<Row>()
  }

  payload() {
    return { sql: this.sql, params: this.params.map(clean) }
  }
}

class RestClient {
  constructor(private readonly options: RestD1Options) {}

  async query(statements: RestStatement[]): Promise<QueryResult[]> {
    const doFetch = this.options.fetch ?? fetch
    const { accountId, databaseId, token } = this.options
    const body =
      statements.length === 1 ? statements[0].payload() : { batch: statements.map((s) => s.payload()) }
    const res = await doFetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      },
    )
    const text = await res.text()
    let json: ApiResponse
    try {
      json = JSON.parse(text) as ApiResponse
    } catch {
      throw new Error(`D1 REST HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    if (!res.ok || !json.success) {
      const detail = json.errors?.map((e) => e.message).join('; ') || text.slice(0, 200)
      throw new Error(`D1 REST error (HTTP ${res.status}): ${detail}`)
    }
    const results = json.result ?? []
    if (results.length !== statements.length || results.some((r) => !r.success)) {
      throw new Error('D1 REST: a statement failed or the result count does not match')
    }
    return results
  }
}

export function restD1(options: RestD1Options): D1Database {
  const client = new RestClient(options)
  const db = {
    prepare: (sql: string) => new RestStatement(client, sql),
    async batch(statements: RestStatement[]) {
      if (statements.length === 0) return []
      const results = await client.query(statements)
      return results.map((r) => ({ results: r.results ?? [], success: r.success, meta: r.meta ?? {} }))
    },
  }
  return db as unknown as D1Database
}
