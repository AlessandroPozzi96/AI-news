import type { Candidate } from '../collect/types'
import { costUsd } from '../llm/pricing'
import type { Llm, Usage } from '../llm/types'
import { selectPicks, triage } from './triage'
import type { IssueItem, Language } from './types'
import { writeItem } from './write'

/** Picks scored below this are not newsworthy enough: better a shorter issue than filler. */
export const MIN_RELEVANCE_SCORE = 5

export type GenerateOptions = {
  count: number
  language: Language
  /** Minimum number of Claude Code items, when enough exist. */
  minClaudeCode: number
  /** Maximum number of Claude Code items, to keep the issue varied. Defaults to `count`. */
  maxClaudeCode?: number
  /** Picks scored below this are never used, even to fill the issue. Defaults to 0 (no filter). */
  minScore?: number
}

export type GeneratedIssue = {
  items: IssueItem[]
  usage: Usage[]
  costUsd: number
  /** Every source URL of a written story (chosen one and alternatives): none may be republished. */
  consumedUrls: string[]
  skipped: { title: string; reason: string; source: string; url: string }[]
}

export async function generateIssue(
  deps: { llm: Llm; fetch: typeof fetch },
  candidates: Candidate[],
  options: GenerateOptions,
): Promise<GeneratedIssue> {
  const usage: Usage[] = []
  const skipped: GeneratedIssue['skipped'] = []

  const triaged = await triage(deps.llm, candidates, { shortlistSize: options.count * 2, minScore: options.minScore })
  usage.push(triaged.usage)
  const { selected, reserve } = selectPicks(
    triaged.picks,
    options.count,
    options.minClaudeCode,
    options.maxClaudeCode,
  )

  const written: { item: Omit<IssueItem, 'position'>; score: number }[] = []
  const consumed = new Set<string>()
  const attempted = new Set<(typeof selected)[number]>()
  const attempt = async (pick: (typeof selected)[number]) => {
    attempted.add(pick)
    try {
      const out = await writeItem(deps.llm, deps.fetch, pick, options.language)
      usage.push(out.usage)
      written.push({ item: out.item, score: pick.score })
      for (const url of [out.item.sourceUrl, pick.candidate.url, ...(pick.alternatives ?? []).map((c) => c.url)]) consumed.add(url)
      return true
    } catch (e) {
      skipped.push({
        title: pick.candidate.title,
        reason: (e as Error).message,
        source: pick.candidate.source,
        url: pick.candidate.url,
      })
      return false
    }
  }

  await Promise.all(selected.map(attempt))
  // A failed item is replaced by the next best reserve pick so the issue stays full. Reserve picks
  // respect the Claude Code cap first; they only break it if nothing else can fill the issue.
  const maxClaudeCode = options.maxClaudeCode ?? options.count
  const claudeCodeWritten = () => written.filter((w) => w.item.claudeCode).length
  for (const pass of ['respect-cap', 'fill'] as const) {
    for (const pick of reserve) {
      if (written.length >= options.count) break
      if (attempted.has(pick)) continue
      if (pass === 'respect-cap' && pick.claudeCode && claudeCodeWritten() >= maxClaudeCode) continue
      await attempt(pick)
    }
  }

  const items = written
    .sort((a, b) => b.score - a.score)
    .map(({ item }, i) => ({ ...item, position: i + 1 }))
  return { items, usage, costUsd: costUsd(usage), consumedUrls: [...consumed], skipped }
}
