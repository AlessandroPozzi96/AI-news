import { normalizeUrl } from './text'

export async function loadSeenUrls(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare('SELECT url FROM seen_urls').all<{ url: string }>()
  return new Set(results.map((r) => r.url))
}

export async function markUrlsSeen(db: D1Database, urls: string[], published: boolean): Promise<void> {
  if (urls.length === 0) return
  const stmt = db.prepare(
    'INSERT INTO seen_urls (url, published) VALUES (?, ?) ON CONFLICT (url) DO UPDATE SET published = MAX(published, excluded.published)',
  )
  await db.batch(urls.map((u) => stmt.bind(normalizeUrl(u), published ? 1 : 0)))
}
