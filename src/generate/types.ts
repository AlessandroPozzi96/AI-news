import { z } from 'zod'

export const CATEGORIES = ['model', 'skill_tool', 'best_practice', 'command_shortcut', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export type Language = 'fr' | 'en'

export const LANGUAGE_NAMES: Record<Language, string> = { fr: 'French', en: 'English' }

export const DetailsSchema = z.object({
  intro: z.string(),
  key_points: z.array(z.string()),
  commands: z.array(z.string()),
  why_it_matters: z.string(),
})
export type Details = z.infer<typeof DetailsSchema>

/** A part of the issue. `news` is 1-3, then `must_have`, then `claude_code`. */
export const SECTIONS = ['news', 'must_have', 'claude_code'] as const
export type Section = (typeof SECTIONS)[number]

/** Items per section: change the issue shape here only. */
export const SECTION_COUNTS: Record<Section, number> = { news: 3, must_have: 2, claude_code: 2 }

/** Order of the issue as read: news first. */
export const SECTION_ORDER: readonly Section[] = SECTIONS

/** Order in which sections are selected: a story goes to the first section that takes it. */
export const SELECTION_ORDER: readonly Section[] = ['claude_code', 'must_have', 'news']

export type IssueItem = {
  position: number
  /** Absent for issues written before sections existed: rendered without a heading. */
  section?: Section
  category: Category
  /** True for the `claude_code` section. */
  claudeCode: boolean
  title: string
  summary: string
  details: Details
  sourceUrl: string
  sourceName: string
}
