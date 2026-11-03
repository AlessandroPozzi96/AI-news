import { gather } from './gather'
import { getJson } from './http'
import { stripHtml, truncate } from './text'
import type { Collector } from './types'

type HnResponse = {
  hits: {
    objectID: string
    title: string | null
    url: string | null
    story_text: string | null
    points: number | null
    num_comments: number | null
    created_at: string
  }[]
}

export function hackerNews(queries: string[], minPoints: number): Collector {
  return {
    name: 'hackernews',
    collect: (ctx) =>
      gather(queries, async (query) => {
        const since = Math.floor(ctx.since.getTime() / 1000)
        const filters = encodeURIComponent(`created_at_i>${since},points>=${minPoints}`)
        const data = await getJson<HnResponse>(
          ctx.fetch,
          `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=${filters}&hitsPerPage=20`,
        )
        return data.hits
          .filter((h) => h.title)
          .map((h) => ({
            title: h.title as string,
            url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
            excerpt: truncate(stripHtml(h.story_text ?? ''), 300),
            source: 'hackernews',
            discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
            publishedAt: h.created_at,
            metrics: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
          }))
      }),
  }
}
