import type { Child } from 'hono/jsx'
import type { IssueItem } from '../generate/types'
import { BRAND, LABELS, LOCALES } from '../i18n'
import { weekNumber } from '../issues/week'
import { formatDate, safeHref, type Links, type RenderIssue } from '../render/shared'

// Colors are tokens so dark mode is a single override, not scattered per component.
const CSS = `
:root{--bg:#f3f4f6;--card:#fff;--text:#111827;--muted:#6b7280;--border:#e5e7eb;--accent:#4338ca;--chip:#eef2ff;--chip-text:#3730a3;--chip2:#fff1e6;--chip2-text:#9a3412;--code:#0f172a;--code-text:#e2e8f0}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f19;--card:#111827;--text:#f3f4f6;--muted:#9ca3af;--border:#1f2937;--accent:#a5b4fc;--chip:#1e1b4b;--chip-text:#c7d2fe;--chip2:#431407;--chip2-text:#fdba74;--code:#020617;--code-text:#e2e8f0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
.card{background:var(--card);border-radius:12px;padding:24px;border:1px solid var(--border);overflow-wrap:anywhere}
.brand{font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);text-decoration:none}
h1{font-size:28px;line-height:1.25;margin:12px 0}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:28px 0 8px}
p{margin:8px 0}
a{color:var(--accent)}
.chip{display:inline-block;padding:2px 9px;border-radius:10px;background:var(--chip);color:var(--chip-text);font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;margin-right:6px}
.chip.cc{background:var(--chip2);color:var(--chip2-text)}
.lead{font-size:18px;color:var(--muted)}
ul{padding-left:20px}li{margin:6px 0}
pre{background:var(--code);color:var(--code-text);padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cmd+.cmd{margin-top:8px}
.items{list-style:none;padding:0;margin:0}
.items li{padding:20px 0;border-top:1px solid var(--border);margin:0}
.items li:first-child{border-top:0}
.items a.title{font-size:19px;font-weight:700;color:var(--text);text-decoration:none}
.btn{display:inline-block;margin-top:24px;padding:10px 16px;border-radius:8px;border:1px solid var(--border);text-decoration:none;font-weight:600}
footer{margin-top:20px;font-size:13px;color:var(--muted)}
label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 4px}
input,select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit}
button.btn{cursor:pointer;background:var(--accent);color:var(--card);border-color:var(--accent)}
button.btn.ghost{background:transparent;color:var(--text);border-color:var(--border);margin:0;padding:4px 10px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{text-align:left;padding:8px 6px;border-top:1px solid var(--border);vertical-align:top}
th{font-size:12px;color:var(--muted);text-transform:uppercase;border-top:0}
.msg{padding:8px 12px;border-radius:8px;background:var(--chip);color:var(--chip-text);margin:12px 0}
.msg.err{background:var(--chip2);color:var(--chip2-text)}
`

export function Layout(props: { lang: string; title: string; description?: string; children: Child }) {
  return (
    <html lang={props.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        {props.description ? <meta name="description" content={props.description} /> : null}
        <title>{props.title}</title>
        <style>{CSS}</style>
      </head>
      <body>
        <main>{props.children}</main>
      </body>
    </html>
  )
}

function Chips(props: { item: IssueItem; lang: 'fr' | 'en' }) {
  const t = LABELS[props.lang]
  return (
    <div>
      <span class="chip">{t.categories[props.item.category]}</span>
      {props.item.claudeCode ? <span class="chip cc">{t.claudeCode}</span> : null}
    </div>
  )
}

export function IssuePage(props: { issue: RenderIssue; links: Links }) {
  const { issue, links } = props
  const t = LABELS[issue.language]
  const week = weekNumber(issue.id)
  return (
    <Layout lang={issue.language} title={`${BRAND} #${week}`} description={t.tagline}>
      <div class="card">
        <span class="brand">
          {BRAND} · {t.weekLabel} {week} · {formatDate(issue.date, LOCALES[issue.language])}
        </span>
        <h1>{t.tagline}</h1>
        <ol class="items">
          {issue.items.map((it) => (
            <li>
              <Chips item={it} lang={issue.language} />
              <a class="title" href={links.item(it.position)}>
                {it.position}. {it.title}
              </a>
              <p>{it.summary}</p>
              <a href={links.item(it.position)}>{t.readMore} →</a>
            </li>
          ))}
        </ol>
      </div>
      <footer>
        <a href={links.unsubscribe}>{t.unsubscribe}</a>
      </footer>
    </Layout>
  )
}

export function ItemPage(props: { issue: RenderIssue; item: IssueItem; links: Links }) {
  const { issue, item, links } = props
  const t = LABELS[issue.language]
  const week = weekNumber(issue.id)
  const href = safeHref(item.sourceUrl)
  const d = item.details
  return (
    <Layout lang={issue.language} title={`${item.title} · ${BRAND}`} description={item.summary}>
      <div class="card">
        <a class="brand" href={links.issue}>
          {BRAND} · {t.weekLabel} {week}
        </a>
        <h1>{item.title}</h1>
        <Chips item={item} lang={issue.language} />
        <p class="lead">{item.summary}</p>
        <p>{d.intro}</p>

        {d.key_points.length > 0 ? (
          <>
            <h2>{t.keyPoints}</h2>
            <ul>
              {d.key_points.map((p) => (
                <li>{p}</li>
              ))}
            </ul>
          </>
        ) : null}

        {d.commands.length > 0 ? (
          <>
            <h2>{t.commands}</h2>
            {d.commands.map((c) => (
              <pre class="cmd">
                <code>{c}</code>
              </pre>
            ))}
          </>
        ) : null}

        <h2>{t.whyItMatters}</h2>
        <p>{d.why_it_matters}</p>

        {href ? (
          <a class="btn" href={href} rel="noopener noreferrer" target="_blank">
            {t.source} · {item.sourceName} ↗
          </a>
        ) : null}
        <br />
        <a class="btn" href={links.issue}>
          ← {t.backToIssue}
        </a>
      </div>
      <footer>
        <a href={links.unsubscribe}>{t.unsubscribe}</a>
      </footer>
    </Layout>
  )
}

export function NotFoundPage(props: { lang: 'fr' | 'en' }) {
  const t = LABELS[props.lang]
  return (
    <Layout lang={props.lang} title={`${t.notFound} · ${BRAND}`}>
      <div class="card">
        <span class="brand">{BRAND}</span>
        <h1>{t.notFound}</h1>
      </div>
    </Layout>
  )
}

export function UnsubscribePage(props: {
  lang: 'fr' | 'en'
  state: 'confirm' | 'done' | 'invalid'
  action?: string
}) {
  const t = LABELS[props.lang]
  return (
    <Layout lang={props.lang} title={`${t.unsubTitle} · ${BRAND}`}>
      <div class="card">
        <span class="brand">{BRAND}</span>
        <h1>{t.unsubTitle}</h1>
        {props.state === 'confirm' ? (
          <>
            <p>{t.unsubBody}</p>
            <form method="post" action={props.action}>
              <button class="btn" type="submit">
                {t.unsubButton}
              </button>
            </form>
          </>
        ) : null}
        {props.state === 'done' ? <p>{t.unsubDone}</p> : null}
        {props.state === 'invalid' ? <p>{t.unsubInvalid}</p> : null}
      </div>
    </Layout>
  )
}

export async function renderPage(node: { toString(): string | Promise<string> }): Promise<string> {
  return `<!DOCTYPE html>${await node.toString()}`
}
