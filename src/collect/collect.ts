import { normalizeUrl } from './text'
import type { Candidate, CollectContext, CollectResult, Collector } from './types'

export async function collectAll(
  collectors: Collector[],
  ctx: CollectContext,
  seenUrls: ReadonlySet<string> = new Set(),
): Promise<CollectResult> {
  const settled = await Promise.allSettled(collectors.map((c) => c.collect(ctx)))

  const errors: CollectResult['errors'] = []
  const all: Candidate[] = []
  settled.forEach((r, i) => {
    const name = collectors[i].name
    if (r.status === 'rejected') {
      errors.push({ source: name, message: (r.reason as Error).message })
      return
    }
    all.push(...r.value.candidates)
    for (const message of r.value.errors) errors.push({ source: name, message })
  })

  const byUrl = new Map<string, Candidate>()
  for (const candidate of all) {
    const key = normalizeUrl(candidate.url)
    if (seenUrls.has(key)) continue
    // The undated version wins: it decides the section, and a trending repository in the catalogue stays a must-have.
    const known = byUrl.get(key)
    if (!known || (candidate.evergreen && !known.evergreen)) byUrl.set(key, candidate)
  }

  const candidates = [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const countsBySource: Record<string, number> = {}
  for (const c of candidates) countsBySource[c.source] = (countsBySource[c.source] ?? 0) + 1

  return { candidates, errors, countsBySource }
}
