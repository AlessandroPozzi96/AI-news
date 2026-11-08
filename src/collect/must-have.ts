import type { Candidate, Collector } from './types'

/**
 * Versioned, hand-edited list of tools, MCP servers, skills and techniques every developer using AI
 * agents should have. Entries are undated and take priority over popular repositories. Each URL was
 * checked to resolve; add an entry only after checking it. Once an entry is published it is never
 * proposed again (seen_urls).
 */
export type CatalogueEntry = { title: string; url: string; excerpt: string }

export const MUST_HAVE_CATALOGUE: CatalogueEntry[] = [
  {
    title: 'Graphify',
    url: 'https://github.com/Graphify-Labs/graphify',
    excerpt: 'Turns a codebase and its docs into a queryable knowledge graph, with a /graphify skill for Claude Code.',
  },
  {
    title: 'Context7',
    url: 'https://github.com/upstash/context7',
    excerpt: 'MCP server that gives coding agents up-to-date, version-specific library documentation.',
  },
  {
    title: 'Superpowers',
    url: 'https://github.com/obra/superpowers',
    excerpt: 'Skills library for coding agents: structured planning, test-driven development and review workflows.',
  },
  {
    title: 'Playwright MCP',
    url: 'https://github.com/microsoft/playwright-mcp',
    excerpt: 'MCP server that lets an agent drive a real browser through accessibility snapshots to test web apps.',
  },
]

export const CATALOGUE_SOURCE = 'catalogue'

export function mustHaveCatalogue(entries: CatalogueEntry[] = MUST_HAVE_CATALOGUE): Collector {
  return {
    name: 'must-have-catalogue',
    collect: async () => {
      const candidates: Candidate[] = entries.map((e) => ({
        title: e.title,
        url: e.url,
        excerpt: e.excerpt,
        source: CATALOGUE_SOURCE,
        publishedAt: '',
        evergreen: true,
      }))
      return { candidates, errors: [] }
    },
  }
}
