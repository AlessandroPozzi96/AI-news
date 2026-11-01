import type { Usage } from './types'

/** USD per million tokens (input, output), standard rates for prompts under 100K tokens. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
}

export function costUsd(usages: Usage[]): number {
  return usages.reduce((sum, u) => {
    const p = PRICES[u.model]
    if (!p) return sum
    return sum + (u.inputTokens * p.input + u.outputTokens * p.output) / 1_000_000
  }, 0)
}
