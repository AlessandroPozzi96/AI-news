import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Llm, ModelTier } from './types'

export const MODELS: Record<ModelTier, string> = {
  triage: 'claude-haiku-5-5',
  writer: 'claude-sonnet-5-5',
}

const EFFORT = { triage: 'low', writer: 'medium' } as const

export function anthropicLlm(apiKey: string): Llm {
  const client = new Anthropic({ apiKey })
  return {
    async generate({ tier, system, user, schema, maxTokens }) {
      const model = MODELS[tier]
      const res = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        system,
        output_config: { effort: EFFORT[tier], format: zodOutputFormat(schema) },
        messages: [{ role: 'user', content: user }],
      })
      if (res.stop_reason === 'refusal') {
        throw new Error(`${model} refused the request (${res.stop_details?.category ?? 'unknown'})`)
      }
      if (res.stop_reason === 'max_tokens') throw new Error(`${model} hit max_tokens (${maxTokens})`)
      if (res.parsed_output == null) throw new Error(`${model} returned no parsable output`)
      return {
        data: res.parsed_output,
        usage: { model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      }
    },
  }
}
