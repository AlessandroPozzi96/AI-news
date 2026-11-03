export type Candidate = {
  title: string
  url: string
  excerpt: string
  source: string
  publishedAt: string
  /** Comment thread (e.g. Hacker News) used to enrich a source that is too thin on its own. */
  discussionUrl?: string
  metrics?: { points?: number; comments?: number; stars?: number }
}

export type CollectContext = {
  since: Date
  fetch: typeof fetch
  githubToken?: string
}

export type CollectOutput = {
  candidates: Candidate[]
  errors: string[]
}

export type Collector = {
  name: string
  collect: (ctx: CollectContext) => Promise<CollectOutput>
}

export type CollectError = { source: string; message: string }

export type CollectResult = {
  candidates: Candidate[]
  errors: CollectError[]
  countsBySource: Record<string, number>
}
