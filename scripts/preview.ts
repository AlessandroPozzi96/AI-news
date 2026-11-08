import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import type { GeneratedIssue } from '../src/generate/issue'
import { isoWeekId } from '../src/issues/week'
import { renderEmail } from '../src/render/email'
import type { Links, RenderIssue } from '../src/render/shared'
import { IssuePage, ItemPage, renderPage } from '../src/web/pages'
import { THEME_SCRIPT } from '../src/web/theme'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}

const lang = arg('lang', 'fr') as 'fr' | 'en'
let file = arg('file', '')
if (!file) {
  const latest = (await readdir('out')).filter((f) => /^issue-.*\.json$/.test(f)).sort().pop()
  if (!latest) throw new Error('No out/issue-*.json found: run `npm run dry-run` first.')
  file = `out/${latest}`
}

const generated = JSON.parse(await readFile(file, 'utf-8')) as GeneratedIssue
const now = new Date()
const issue: RenderIssue = { id: isoWeekId(now), language: lang, items: generated.items, date: now }

// Relative links so the generated files open straight from disk.
const links: Links = {
  issue: 'index.html',
  item: (position) => `item-${position}.html`,
  unsubscribe: '#unsubscribe',
  theme: 'theme.js',
}

const dir = 'out/preview'
await mkdir(dir, { recursive: true })
await writeFile(`${dir}/theme.js`, THEME_SCRIPT)
const email = renderEmail(issue, links)
await writeFile(`${dir}/email.html`, email.html)
await writeFile(`${dir}/email.txt`, `Subject: ${email.subject}\n\n${email.text}`)
await writeFile(`${dir}/index.html`, await renderPage(IssuePage({ issue, links })))
for (const item of issue.items) {
  await writeFile(`${dir}/item-${item.position}.html`, await renderPage(ItemPage({ issue, item, links })))
}
console.log(`Subject: ${email.subject}`)
console.log(`Preview written to ${dir}/ (open email.html or index.html)`)
