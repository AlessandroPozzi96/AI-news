import type { Candidate, Collector } from '../src/collect/types'
import type { GenerateRequest, Llm, Usage } from '../src/llm/types'
import type { MailMessage, MailResult, Mailer } from '../src/mail/types'

export const candidate = (n: number, source = 'src'): Candidate => ({
  title: `Candidate ${n}`,
  url: `https://example.com/${n}`,
  excerpt: `excerpt ${n}`,
  source,
  publishedAt: '2026-10-30T00:00:00Z',
})

export const collectorOf = (candidates: Candidate[]): Collector => ({
  name: 'fake',
  collect: async () => ({ candidates, errors: [] }),
})

type Handler = (req: GenerateRequest<unknown>) => unknown

export function fakeLlm(handlers: { triage: Handler; writer: Handler }): Llm & { calls: GenerateRequest<unknown>[] } {
  const calls: GenerateRequest<unknown>[] = []
  return {
    calls,
    async generate<T>(req: GenerateRequest<T>) {
      calls.push(req as GenerateRequest<unknown>)
      const data = handlers[req.tier](req as GenerateRequest<unknown>)
      const usage: Usage = { model: req.tier === 'triage' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5', inputTokens: 1000, outputTokens: 500 }
      return { data: req.schema.parse(data), usage }
    },
  }
}

export const writerOk: Handler = (req) => ({
  title: `T: ${req.user.match(/Source title: (.*)/)?.[1]}`,
  summary: 'Two short sentences.',
  details: { intro: 'Context.', key_points: ['a', 'b', 'c'], commands: [], why_it_matters: 'Because.' },
})

export const triageOf = (n: number): Handler => () => ({
  picks: Array.from({ length: n }, (_, i) => ({
    id: i,
    category: 'other',
    score: 10 - i,
    claude_code_related: i % 2 === 0,
  })),
})

export const longPage = (async () =>
  new Response(`<html><main>${'Real article content. '.repeat(40)}</main></html>`)) as typeof fetch

export type SentMail = MailMessage & { key: string }

/** Records every message; `failFor` makes specific recipients fail, `throwOnce` fails the whole call once. */
export function fakeMailer(opts: { failFor?: string[]; throwOnce?: boolean } = {}): Mailer & {
  sent: SentMail[]
  failFor: Set<string>
  throwOnce: boolean
} {
  const state = { sent: [] as SentMail[], failFor: new Set(opts.failFor ?? []), throwOnce: opts.throwOnce ?? false }
  return Object.assign(state, {
    async sendBatch(messages: MailMessage[], key: string): Promise<MailResult[]> {
      if (state.throwOnce) {
        state.throwOnce = false
        throw new Error('Resend HTTP 500: boom')
      }
      return messages.map((m, i) => {
        if (state.failFor.has(m.to)) return { error: 'rejected' }
        state.sent.push({ ...m, key })
        return { id: `id-${state.sent.length}-${i}` }
      })
    },
  })
}
