import { describe, expect, it } from 'vitest'
import type { Candidate } from '../src/collect/types'
import { generateIssue } from '../src/generate/issue'
import { selectPicks, triage, type Pick } from '../src/generate/triage'
import { costUsd } from '../src/llm/pricing'
import type { GenerateRequest, Llm, Usage } from '../src/llm/types'

const cand = (n: number, source = 'src'): Candidate => ({
  title: `Candidate ${n}`,
  url: `https://example.com/${n}`,
  excerpt: `excerpt ${n}`,
  source,
  publishedAt: '2026-10-30T00:00:00Z',
})

const usage = (model: string): Usage => ({ model, inputTokens: 1000, outputTokens: 500 })

type Handler = (req: GenerateRequest<unknown>) => unknown

function fakeLlm(handlers: { triage: Handler; writer: Handler }): Llm & { calls: GenerateRequest<unknown>[] } {
  const calls: GenerateRequest<unknown>[] = []
  return {
    calls,
    async generate<T>(req: GenerateRequest<T>) {
      calls.push(req as GenerateRequest<unknown>)
      const data = handlers[req.tier](req as GenerateRequest<unknown>)
      return { data: req.schema.parse(data), usage: usage(req.tier === 'triage' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5') }
    },
  }
}

const page = (text: string) => ({
  fetch: (async () => new Response(`<html><main>${text}</main></html>`)) as typeof fetch,
})

describe('triage', () => {
  it('maps ids to candidates, drops invalid and duplicate ids, sorts by score', async () => {
    const llm = fakeLlm({
      triage: () => ({
        picks: [
          { id: 1, category: 'model', score: 4, claude_code_related: false },
          { id: 99, category: 'other', score: 10, claude_code_related: false },
          { id: 2, category: 'skill_tool', score: 9, claude_code_related: true },
          { id: 2, category: 'skill_tool', score: 9, claude_code_related: true },
        ],
      }),
      writer: () => ({}),
    })
    const { picks } = await triage(llm, [cand(0), cand(1), cand(2)], { shortlistSize: 4 })
    expect(picks.map((p) => p.candidate.title)).toEqual(['Candidate 2', 'Candidate 1'])
  })

  it('wraps candidates in a data block and flags them as untrusted', async () => {
    const llm = fakeLlm({ triage: () => ({ picks: [] }), writer: () => ({}) })
    await triage(llm, [cand(0)], { shortlistSize: 2 })
    expect(llm.calls[0].user).toContain('<candidates>')
    expect(llm.calls[0].system).toContain('untrusted')
  })
})

describe('selectPicks', () => {
  const pick = (n: number, score: number, claudeCode: boolean): Pick => ({
    candidate: cand(n),
    category: 'other',
    score,
    claudeCode,
  })

  it('guarantees the Claude Code quota even when they score lower', () => {
    const picks = [pick(1, 9, false), pick(2, 8, false), pick(3, 7, false), pick(4, 3, true), pick(5, 2, true)]
    const { selected, reserve } = selectPicks(picks, 3, 2)
    expect(selected.filter((p) => p.claudeCode)).toHaveLength(2)
    expect(selected).toHaveLength(3)
    expect(reserve.map((p) => p.candidate.title)).toEqual(['Candidate 2', 'Candidate 3'])
  })

  it('does not fail when fewer Claude Code items exist than the quota', () => {
    const picks = [pick(1, 9, false), pick(2, 8, false), pick(3, 7, true)]
    const { selected } = selectPicks(picks, 3, 2)
    expect(selected).toHaveLength(3)
  })
})

describe('generateIssue', () => {
  const writerOk: Handler = (req) => ({
    title: `T: ${req.user.match(/Source title: (.*)/)?.[1]}`,
    summary: 'Two short sentences.',
    details: {
      intro: 'Context.',
      key_points: ['a', 'b', 'c'],
      commands: ['npm i -g real-tool', 'fake-command --hallucinated'],
      why_it_matters: 'Because.',
    },
  })

  it('writes items, keeps only verbatim commands and takes the source url from the candidate', async () => {
    const llm = fakeLlm({
      triage: () => ({ picks: [{ id: 0, category: 'skill_tool', score: 8, claude_code_related: true }] }),
      writer: writerOk,
    })
    const issue = await generateIssue(
      { llm, fetch: page('Install with `npm i -g real-tool` today').fetch },
      [cand(0)],
      { count: 1, language: 'fr', minClaudeCode: 0 },
    )
    expect(issue.items).toHaveLength(1)
    expect(issue.items[0].details.commands).toEqual(['npm i -g real-tool'])
    expect(issue.items[0].sourceUrl).toBe('https://example.com/0')
    expect(issue.items[0].position).toBe(1)
    expect(llm.calls.find((c) => c.tier === 'writer')?.system).toContain('French')
  })

  it('replaces a failing item with the next reserve pick', async () => {
    const llm = fakeLlm({
      triage: () => ({
        picks: [
          { id: 0, category: 'model', score: 9, claude_code_related: false },
          { id: 1, category: 'model', score: 8, claude_code_related: false },
          { id: 2, category: 'model', score: 7, claude_code_related: false },
        ],
      }),
      writer: (req) => {
        if (req.user.includes('Candidate 0')) throw new Error('refused')
        return writerOk(req)
      },
    })
    const issue = await generateIssue({ llm, fetch: page('x').fetch }, [cand(0), cand(1), cand(2)], {
      count: 2,
      language: 'en',
      minClaudeCode: 0,
    })
    expect(issue.items.map((i) => i.sourceUrl).sort()).toEqual(['https://example.com/1', 'https://example.com/2'])
    expect(issue.skipped).toEqual([{ title: 'Candidate 0', reason: 'refused' }])
  })

  it('orders items by score and reports a cost', async () => {
    const llm = fakeLlm({
      triage: () => ({
        picks: [
          { id: 0, category: 'other', score: 3, claude_code_related: false },
          { id: 1, category: 'other', score: 9, claude_code_related: false },
        ],
      }),
      writer: writerOk,
    })
    const issue = await generateIssue({ llm, fetch: page('x').fetch }, [cand(0), cand(1)], {
      count: 2,
      language: 'fr',
      minClaudeCode: 0,
    })
    expect(issue.items.map((i) => i.sourceUrl)).toEqual(['https://example.com/1', 'https://example.com/0'])
    expect(issue.costUsd).toBeGreaterThan(0)
  })
})

describe('costUsd', () => {
  it('prices haiku and sonnet per million tokens', () => {
    const cost = costUsd([
      { model: 'claude-haiku-5-5', inputTokens: 1_000_000, outputTokens: 1_000_000 },
      { model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 1_000_000 },
    ])
    expect(cost).toBeCloseTo(0.1 + 0.5 + 2 + 10)
  })

  it('ignores unknown models instead of throwing', () => {
    expect(costUsd([{ model: 'other', inputTokens: 1, outputTokens: 1 }])).toBe(0)
  })
})
