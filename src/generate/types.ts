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

export type IssueItem = {
  position: number
  category: Category
  claudeCode: boolean
  title: string
  summary: string
  details: Details
  sourceUrl: string
  sourceName: string
}
