import { CLAUDE_DOCS_SOURCE } from '../collect/claude-docs'
import { POPULAR_SOURCE_PREFIX } from '../collect/github'
import { CATALOGUE_SOURCE } from '../collect/must-have'
import { normalizeUrl } from '../collect/text'
import type { Candidate } from '../collect/types'
import { costUsd } from '../llm/pricing'
import type { Llm, Usage } from '../llm/types'
import { triage, type Pick } from './triage'
import { SECTION_COUNTS, SECTION_ORDER, SELECTION_ORDER, type IssueItem, type Language, type Section } from './types'
import { writeItem } from './write'

/** Picks scored below this are not newsworthy enough: better a shorter issue than filler. Applies to news only. */
export const MIN_RELEVANCE_SCORE = 5

export type GenerateOptions = {
  language: Language
  /** Minimum score of a news pick. Defaults to 0 (no filter). */
  minScore?: number
  /** Items per section. Defaults to `SECTION_COUNTS`. */
  sectionCounts?: Record<Section, number>
}

export type GeneratedIssue = {
  items: IssueItem[]
  usage: Usage[]
  costUsd: number
  /** Every source URL of a written story (chosen one and alternatives): none may be republished. */
  consumedUrls: string[]
  skipped: { title: string; reason: string; source: string; url: string }[]
}

/**
 * Candidate pools of a section, in the order they are tried. A later pool only fills what the earlier
 * ones could not: catalogue before popular repositories, and documentation as the Claude Code reserve.
 * Undated candidates never reach the news section.
 */
export function sectionPools(section: Section, candidates: Candidate[]): Candidate[][] {
  const dated = candidates.filter((c) => !c.evergreen)
  const undated = candidates.filter((c) => c.evergreen)
  switch (section) {
    case 'news':
      return [dated]
    case 'must_have':
      return [
        undated.filter((c) => c.source === CATALOGUE_SOURCE),
        undated.filter((c) => c.source.startsWith(POPULAR_SOURCE_PREFIX)),
      ]
    case 'claude_code':
      // One recent item, one from the documentation, then back to recent items if the documentation fell short.
      return [dated, undated.filter((c) => c.source === CLAUDE_DOCS_SOURCE), dated]
  }
}

type Written = { item: Omit<IssueItem, 'position'>; section: Section; score: number }

export async function generateIssue(
  deps: { llm: Llm; fetch: typeof fetch },
  candidates: Candidate[],
  options: GenerateOptions,
): Promise<GeneratedIssue> {
  const usage: Usage[] = []
  const skipped: GeneratedIssue['skipped'] = []
  const written: Written[] = []
  /** Normalized urls of every written story (chosen source and alternatives): a story is written once. */
  const consumed = new Set<string>()
  const usedStories = new Set<string>()
  const countOf = (section: Section) => written.filter((w) => w.section === section).length
  const counts = options.sectionCounts ?? SECTION_COUNTS

  const attempt = async (section: Section, pick: Pick): Promise<void> => {
    try {
      const out = await writeItem(deps.llm, deps.fetch, pick, options.language, section)
      usage.push(...out.usage)
      written.push({ item: out.item, section, score: pick.score })
      for (const url of [out.item.sourceUrl, pick.candidate.url, ...(pick.alternatives ?? []).map((c) => c.url)]) {
        consumed.add(normalizeUrl(url))
      }
      if (pick.story) usedStories.add(pick.story)
    } catch (e) {
      skipped.push({ title: pick.candidate.title, reason: (e as Error).message, source: pick.candidate.source, url: pick.candidate.url })
    }
  }

  for (const section of SELECTION_ORDER) {
    for (const [index, pool] of sectionPools(section, candidates).entries()) {
      const missing = counts[section] - countOf(section)
      if (missing <= 0) break
      // Claude Code keeps a slot for a tutorial or a setting, so recent releases do not take both.
      const remaining = section === 'claude_code' && index === 0 ? Math.min(1, missing) : missing
      const target = countOf(section) + remaining
      const available = pool.filter((c) => !consumed.has(normalizeUrl(c.url)))
      if (available.length === 0) continue

      const triaged = await triage(deps.llm, available, {
        section,
        shortlistSize: remaining * 2,
        minScore: section === 'news' ? options.minScore : undefined,
        alreadySelected: written.map((w) => w.item.title),
      })
      usage.push(triaged.usage)
      // A story already written in an earlier section is not repeated here, whatever its source.
      const fresh = triaged.picks
        .filter((p) => !(p.story && usedStories.has(p.story)))
        .map((p) => ({ ...p, alternatives: p.alternatives?.filter((c) => !consumed.has(normalizeUrl(c.url))) }))
      const isFree = (p: Pick) => !consumed.has(normalizeUrl(p.candidate.url))

      // Failed picks are replaced by the next reserve pick, so the section stays full.
      await Promise.all(fresh.slice(0, remaining).filter(isFree).map((p) => attempt(section, p)))
      for (const pick of fresh.slice(remaining)) {
        if (countOf(section) >= target) break
        if (isFree(pick)) await attempt(section, pick)
      }
    }
  }

  const items = written
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || b.score - a.score)
    .map(({ item }, i) => ({ ...item, position: i + 1 }))
  return { items, usage, costUsd: costUsd(usage), consumedUrls: [...consumed], skipped }
}
