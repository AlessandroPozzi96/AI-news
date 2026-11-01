import type { z } from 'zod'

/** `triage` = cheap ranking over many candidates; `writer` = quality writing per item. */
export type ModelTier = 'triage' | 'writer'

export type Usage = {
  model: string
  inputTokens: number
  outputTokens: number
}

export type GenerateRequest<T> = {
  tier: ModelTier
  system: string
  user: string
  schema: z.ZodType<T>
  maxTokens: number
}

export interface Llm {
  generate<T>(request: GenerateRequest<T>): Promise<{ data: T; usage: Usage }>
}
