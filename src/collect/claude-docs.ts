import { getText } from './http'
import type { Candidate, Collector } from './types'

/** Index of the Claude Code documentation, in the llms.txt convention (one "- [title](url): description" per page). */
export const CLAUDE_DOCS_INDEX = 'https://code.claude.com/docs/llms.txt'
export const CLAUDE_DOCS_SOURCE = 'claude-docs'

/** Only English pages about settings and how-to material: tutorials and configuration are the reserve for Claude Code. */
const DOC_PAGE = /^https:\/\/code\.claude\.com\/docs\/en\/([^\s)]*)$/
const WANTED_PAGE =
  /(settings|hooks|workflows|best-practices|memory|sessions|statusline|keybindings|output-styles|skills|subagents|permissions|sandbox|costs|troubleshooting|commands|mcp|plugins|model-config|checkpointing|headless|context-window|prompt-caching|features-overview|quickstart)/i

const LINE = /^- \[([^\]]+)\]\(([^)\s]+)\)(?::\s*(.*))?$/

/** Undated candidates for the wanted documentation pages found in the llms.txt index. */
export function parseLlmsTxt(text: string): Candidate[] {
  const out: Candidate[] = []
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim())
    if (!m) continue
    const [, title, url, description = ''] = m
    if (!DOC_PAGE.test(url) || !WANTED_PAGE.test(url)) continue
    out.push({
      title: title.trim(),
      url,
      excerpt: description.trim(),
      source: CLAUDE_DOCS_SOURCE,
      publishedAt: '',
      evergreen: true,
    })
  }
  return out
}

export function claudeDocs(indexUrl: string = CLAUDE_DOCS_INDEX, max = 60): Collector {
  return {
    name: 'claude-docs',
    collect: async (ctx) => {
      const text = await getText(ctx.fetch, indexUrl, { Accept: 'text/plain, text/markdown' })
      return { candidates: parseLlmsTxt(text).slice(0, max), errors: [] }
    },
  }
}
