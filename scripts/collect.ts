import { collectAll } from '../src/collect/collect'
import { COLLECTORS } from '../src/collect/sources'

const daysArg = process.argv.indexOf('--days')
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 7
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 40

const since = new Date(Date.now() - days * 24 * 3600 * 1000)
const result = await collectAll(COLLECTORS, {
  since,
  fetch,
  githubToken: process.env.GITHUB_TOKEN || undefined,
})

console.log(`Candidates since ${since.toISOString()}: ${result.candidates.length}\n`)
console.log('By source:')
for (const [source, n] of Object.entries(result.countsBySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${source}`)
}
if (result.errors.length) {
  console.log('\nErrors:')
  for (const e of result.errors) console.log(`  [${e.source}] ${e.message}`)
}
console.log(`\nLatest ${limit}:`)
for (const c of result.candidates.slice(0, limit)) {
  const m = c.metrics ? ` (${Object.entries(c.metrics).map(([k, v]) => `${k}=${v}`).join(' ')})` : ''
  console.log(`- [${c.publishedAt.slice(0, 10)}] ${c.title}${m}\n    ${c.source} — ${c.url}`)
}
