import { mkdir, writeFile } from 'node:fs/promises'
import { collectAll } from '../src/collect/collect'
import { COLLECTORS } from '../src/collect/sources'
import { generateIssue } from '../src/generate/issue'
import type { Language } from '../src/generate/types'
import { anthropicLlm } from '../src/llm/anthropic'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is missing: put it in .dev.vars (see .dev.vars.example).')
  process.exit(1)
}

const days = Number(arg('days', '7'))
const count = Number(arg('count', '5'))
const language = arg('lang', 'fr') as Language

const since = new Date(Date.now() - days * 24 * 3600 * 1000)
console.log(`Collecting (last ${days} days)…`)
const collected = await collectAll(COLLECTORS, { since, fetch, githubToken: process.env.GITHUB_TOKEN || undefined })
console.log(`${collected.candidates.length} candidates, ${collected.errors.length} source errors`)

console.log(`Generating ${count} items in ${language}…`)
const issue = await generateIssue(
  { llm: anthropicLlm(apiKey), fetch },
  collected.candidates,
  { count, language, minClaudeCode: Math.ceil(count * 0.4) },
)

const stamp = new Date().toISOString().slice(0, 10)
await mkdir('out', { recursive: true })
await writeFile(`out/issue-${stamp}.json`, JSON.stringify(issue, null, 2))

const md = issue.items
  .map((it) =>
    [
      `## ${it.position}. ${it.title}`,
      `*${it.category}${it.claudeCode ? ' · Claude Code' : ''}* — [${it.sourceName}](${it.sourceUrl})`,
      '',
      it.summary,
      '',
      it.details.intro,
      '',
      ...it.details.key_points.map((p) => `- ${p}`),
      ...(it.details.commands.length ? ['', '```', ...it.details.commands, '```'] : []),
      '',
      `**Why it matters:** ${it.details.why_it_matters}`,
    ].join('\n'),
  )
  .join('\n\n---\n\n')
await writeFile(`out/issue-${stamp}.md`, md)

console.log(`\nWrote out/issue-${stamp}.md and .json`)
console.log(`Estimated LLM cost: $${issue.costUsd.toFixed(4)}`)
for (const s of issue.skipped) console.log(`Skipped: ${s.title} — ${s.reason}`)
