import type { Candidate } from '../collect/types'
import { costUsd } from '../llm/pricing'
import type { Llm, Usage } from '../llm/types'
import { selectPicks, triage } from './triage'
import type { IssueItem, Language } from './types'
import { writeItem } from './write'

export type GenerateOptions = {
  count: number
  language: Language
  /** Minimum number of Claude Code items, when enough exist. */
  minClaudeCode: number
}

export type GeneratedIssue = {
  items: IssueItem[]
  usage: Usage[]
  costUsd: number
  skipped: { title: string; reason: string }[]
}

export async function generateIssue(
  deps: { llm: Llm; fetch: typeof fetch },
  candidates: Candidate[],
  options: GenerateOptions,
): Promise<GeneratedIssue> {
  const usage: Usage[] = []
  const skipped: GeneratedIssue['skipped'] = []

  const triaged = await triage(deps.llm, candidates, { shortlistSize: options.count * 2 })
  usage.push(triaged.usage)
  const { selected, reserve } = selectPicks(triaged.picks, options.count, options.minClaudeCode)

  const written: { item: Omit<IssueItem, 'position'>; score: number }[] = []
  const attempt = async (pick: (typeof selected)[number]) => {
    try {
      const out = await writeItem(deps.llm, deps.fetch, pick, options.language)
      usage.push(out.usage)
      written.push({ item: out.item, score: pick.score })
      return true
    } catch (e) {
      skipped.push({ title: pick.candidate.title, reason: (e as Error).message })
      return false
    }
  }

  await Promise.all(selected.map(attempt))
  // A failed item is replaced by the next best reserve pick so the issue stays full.
  for (const pick of reserve) {
    if (written.length >= options.count) break
    await attempt(pick)
  }

  const items = written
    .sort((a, b) => b.score - a.score)
    .map(({ item }, i) => ({ ...item, position: i + 1 }))
  return { items, usage, costUsd: costUsd(usage), skipped }
}
