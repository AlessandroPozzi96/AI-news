import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { collectAll } from '../src/collect/collect'
import { parseLlmsTxt, claudeDocs, CLAUDE_DOCS_SOURCE } from '../src/collect/claude-docs'
import { githubPopular, githubReleases } from '../src/collect/github'
import { hackerNews } from '../src/collect/hackernews'
import { CATALOGUE_SOURCE, MUST_HAVE_CATALOGUE, mustHaveCatalogue } from '../src/collect/must-have'
import { parseFeed, rssFeeds } from '../src/collect/rss'
import { loadSeenUrls, markUrlsSeen } from '../src/collect/seen'
import { HN_QUERIES } from '../src/collect/sources'
import { normalizeUrl, stripHtml } from '../src/collect/text'
import type { Candidate, CollectContext, Collector } from '../src/collect/types'

const SINCE = new Date('2026-10-25T00:00:00Z')

function fakeFetch(routes: Record<string, string | number>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!hit) return new Response('not found', { status: 404 })
    const [, body] = hit
    return typeof body === 'number' ? new Response('err', { status: body }) : new Response(body)
  }) as typeof fetch
}

const ctx = (routes: Record<string, string | number>): CollectContext => ({
  since: SINCE,
  fetch: fakeFetch(routes),
})

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>New model &amp; more</title>
    <link>https://example.com/post-1</link>
    <pubDate>Fri, 30 Oct 2026 10:00:00 +0000</pubDate>
    <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
  </item>
  <item>
    <title>Too old</title>
    <link>https://example.com/old</link>
    <pubDate>Mon, 01 Jan 2026 10:00:00 +0000</pubDate>
  </item>
  <item>
    <title>No date</title>
    <link>https://example.com/nodate</link>
  </item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title type="html">Atom post</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <link rel="self" href="https://example.com/self"/>
    <updated>2026-10-31T08:00:00Z</updated>
    <summary>Short summary</summary>
  </entry>
</feed>`

describe('text helpers', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>a &amp; <b>b</b></p><script>x()</script>')).toBe('a & b')
  })

  it('normalizes urls', () => {
    expect(normalizeUrl('https://WWW.Example.com/a/?utm_source=x&b=2&a=1#frag')).toBe(
      'https://example.com/a?a=1&b=2',
    )
  })
})

describe('rss collector', () => {
  it('parses RSS, drops old and undated items, cleans html', () => {
    const items = parseFeed(RSS, 'feed', SINCE)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      title: 'New model & more',
      url: 'https://example.com/post-1',
      excerpt: 'Hello world',
      source: 'feed',
    })
  })

  it('parses Atom and picks the alternate link', () => {
    const items = parseFeed(ATOM, 'atom', SINCE)
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/atom-1')
  })

  it('reports a failing feed without dropping the others', async () => {
    const collector = rssFeeds([
      { name: 'ok', url: 'https://ok.test/feed' },
      { name: 'rate-limited', url: 'https://limited.test/feed' },
    ])
    const out = await collector.collect(ctx({ 'https://ok.test': RSS, 'https://limited.test': 429 }))
    expect(out.candidates).toHaveLength(1)
    expect(out.errors).toEqual([expect.stringContaining('rate-limited: HTTP 429')])
  })
})

describe('github releases collector', () => {
  it('keeps recent stable releases only', async () => {
    const body = JSON.stringify([
      { name: 'v2', tag_name: 'v2', html_url: 'https://gh/v2', body: 'Notes', draft: false, prerelease: false, published_at: '2026-10-30T00:00:00Z' },
      { name: 'v1', tag_name: 'v1', html_url: 'https://gh/v1', body: '', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z' },
      { name: null, tag_name: 'v3-nightly.1', html_url: 'https://gh/n', body: '', draft: false, prerelease: false, published_at: '2026-10-31T00:00:00Z' },
      { name: 'v4-rc', tag_name: 'v4-rc', html_url: 'https://gh/rc', body: '', draft: false, prerelease: true, published_at: '2026-10-31T00:00:00Z' },
      { name: 'draft', tag_name: 'd', html_url: 'https://gh/d', body: '', draft: true, prerelease: false, published_at: '2026-10-31T00:00:00Z' },
    ])
    const out = await githubReleases(['a/b']).collect(ctx({ 'https://api.github.com/repos/a/b/releases': body }))
    expect(out.errors).toEqual([])
    expect(out.candidates.map((c) => c.url)).toEqual(['https://gh/v2'])
    expect(out.candidates[0].title).toBe('a/b v2')
  })

  it('reports a missing repo as an error', async () => {
    const out = await githubReleases(['a/missing']).collect(ctx({}))
    expect(out.candidates).toEqual([])
    expect(out.errors[0]).toContain('a/missing: HTTP 404')
  })
})

describe('hacker news collector', () => {
  it('maps hits and falls back to the HN item url', async () => {
    const body = JSON.stringify({
      hits: [
        { objectID: '1', title: 'With url', url: 'https://x.test/a', story_text: null, points: 80, num_comments: 5, created_at: '2026-10-30T00:00:00Z' },
        { objectID: '2', title: 'Ask HN', url: null, story_text: '<p>body</p>', points: 60, num_comments: 9, created_at: '2026-10-31T00:00:00Z' },
        { objectID: '3', title: null, url: 'https://x.test/c', story_text: null, points: 90, num_comments: 1, created_at: '2026-10-31T00:00:00Z' },
      ],
    })
    const out = await hackerNews(['claude code'], 50).collect(ctx({ 'https://hn.algolia.com': body }))
    expect(out.candidates).toHaveLength(2)
    expect(out.candidates[1]).toMatchObject({
      url: 'https://news.ycombinator.com/item?id=2',
      excerpt: 'body',
      metrics: { points: 60, comments: 9 },
    })
  })
})

describe('collectAll', () => {
  const make = (name: string, urls: string[], extra: Partial<{ throws: boolean }> = {}): Collector => ({
    name,
    async collect() {
      if (extra.throws) throw new Error('boom')
      return {
        candidates: urls.map((url, i) => ({
          title: `${name}-${i}`,
          url,
          excerpt: '',
          source: name,
          publishedAt: `2026-10-3${i}T00:00:00Z`,
        })),
        errors: [],
      }
    },
  })

  it('survives a throwing collector and records the error', async () => {
    const res = await collectAll([make('a', ['https://x.test/1']), make('b', [], { throws: true })], ctx({}))
    expect(res.candidates).toHaveLength(1)
    expect(res.errors).toEqual([{ source: 'b', message: 'boom' }])
  })

  it('keeps the undated version when a url comes from both a dated and an undated source', async () => {
    const base = { title: 'repo', url: 'https://github.com/a/b', excerpt: '', publishedAt: '2026-11-01T00:00:00Z' }
    const dated: Candidate = { ...base, source: 'github-topic:x' }
    const undated: Candidate = { ...base, source: 'catalogue', evergreen: true }
    const collector = (candidate: Candidate): Collector => ({
      name: candidate.source,
      collect: async () => ({ candidates: [candidate], errors: [] }),
    })
    for (const order of [[dated, undated], [undated, dated]]) {
      const { candidates } = await collectAll(order.map(collector), { since: new Date(0), fetch })
      expect(candidates.map((c) => c.source)).toEqual(['catalogue'])
    }
  })

  it('dedupes across sources by normalized url and sorts newest first', async () => {
    const res = await collectAll(
      [
        make('a', ['https://example.com/p?utm_source=a', 'https://example.com/q']),
        make('b', ['https://www.example.com/p/']),
      ],
      ctx({}),
    )
    expect(res.candidates.map((c) => c.title)).toEqual(['a-1', 'a-0'])
    expect(res.countsBySource).toEqual({ a: 2 })
  })

  it('drops urls already seen', async () => {
    const res = await collectAll([make('a', ['https://example.com/p', 'https://example.com/q'])], ctx({}), new Set(['https://example.com/p']))
    expect(res.candidates.map((c) => c.url)).toEqual(['https://example.com/q'])
  })
})

describe('undated sources', () => {
  it('lists the catalogue with Graphify first, each entry as an undated candidate', async () => {
    expect(MUST_HAVE_CATALOGUE[0].url).toBe('https://github.com/Graphify-Labs/graphify')
    expect(MUST_HAVE_CATALOGUE.every((e) => e.url.startsWith('https://'))).toBe(true)
    const out = await mustHaveCatalogue().collect(ctx({}))
    expect(out.errors).toEqual([])
    expect(out.candidates).toHaveLength(MUST_HAVE_CATALOGUE.length)
    expect(out.candidates[0]).toMatchObject({ source: CATALOGUE_SOURCE, publishedAt: '', evergreen: true })
  })

  it('searches popular repositories by stars and recent activity, never by creation date', async () => {
    let requested = ''
    const doFetch = (async (input: RequestInfo | URL) => {
      requested = decodeURIComponent(String(input))
      return new Response(
        JSON.stringify({
          items: [
            {
              full_name: 'a/tool',
              html_url: 'https://github.com/a/tool',
              description: 'A tool',
              stargazers_count: 900,
              created_at: '2019-01-01T00:00:00Z',
            },
          ],
        }),
      )
    }) as typeof fetch
    const out = await githubPopular(['claude-code'], { minStars: 500, activeWithinDays: 90 }).collect({ since: SINCE, fetch: doFetch })
    expect(requested).toContain('topic:claude-code')
    expect(requested).toContain('stars:>=500')
    expect(requested).toContain('pushed:>')
    expect(requested).toContain('sort=stars')
    expect(requested).not.toContain('created:>')
    expect(out.candidates[0]).toMatchObject({ source: 'github-popular:claude-code', evergreen: true, publishedAt: '' })
  })

  it('reads the Claude Code docs index and keeps settings and tutorial pages', () => {
    const llms = `# Claude Code Docs
- [Hooks reference](https://code.claude.com/docs/en/hooks.md): Hook events and configuration.
- [Changelog](https://code.claude.com/docs/en/changelog.md): Release notes.
- [Settings](https://code.claude.com/docs/en/settings.md): Configure Claude Code with settings.json.
- [Common workflows](https://code.claude.com/docs/fr/common-workflows.md): Other language.`
    const docs = parseLlmsTxt(llms)
    expect(docs.map((d) => d.title)).toEqual(['Hooks reference', 'Settings'])
    expect(docs[1]).toMatchObject({ url: 'https://code.claude.com/docs/en/settings.md', source: CLAUDE_DOCS_SOURCE, evergreen: true, publishedAt: '' })
  })

  it('collects the docs index as undated candidates', async () => {
    const llms = '- [Hooks reference](https://code.claude.com/docs/en/hooks.md): Hook events.'
    const out = await claudeDocs('https://code.claude.com/docs/llms.txt', 10).collect(ctx({ 'https://code.claude.com/docs/llms.txt': llms }))
    expect(out.candidates).toHaveLength(1)
    expect(out.candidates[0].evergreen).toBe(true)
  })

  it('queries Hacker News for general AI agent topics too', () => {
    expect(HN_QUERIES).toEqual(expect.arrayContaining(['claude code', 'AI agents', 'Model Context Protocol']))
  })

  it('drops an undated candidate once its url is seen, so a published must-have is never proposed again', async () => {
    const entry = MUST_HAVE_CATALOGUE[0]
    const out = await mustHaveCatalogue().collect(ctx({}))
    const seen = new Set([normalizeUrl(entry.url)])
    const res = await collectAll([{ name: 'catalogue', collect: async () => out }], ctx({}), seen)
    expect(res.candidates.map((c) => c.url)).not.toContain(entry.url)
  })

  it('sorts undated candidates after the dated ones', async () => {
    const dated: Collector = {
      name: 'dated',
      collect: async () => ({
        candidates: [{ title: 'news', url: 'https://x.test/n', excerpt: '', source: 'dated', publishedAt: '2026-10-31T00:00:00Z' }],
        errors: [],
      }),
    }
    const res = await collectAll([mustHaveCatalogue(), dated], ctx({}))
    expect(res.candidates[0].source).toBe('dated')
  })
})

describe('seen_urls', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })

  it('stores normalized urls and keeps the published flag sticky', async () => {
    await markUrlsSeen(env.DB, ['https://www.example.com/p/?utm_source=x'], true)
    await markUrlsSeen(env.DB, ['https://example.com/p'], false)
    expect(await loadSeenUrls(env.DB)).toEqual(new Set(['https://example.com/p']))
    const row = await env.DB.prepare('SELECT published FROM seen_urls').first<{ published: number }>()
    expect(row?.published).toBe(1)
  })
})
