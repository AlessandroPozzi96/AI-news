import type { Child } from 'hono/jsx'
import type { IssueItem } from '../generate/types'
import { BRAND, LABELS, LOCALES } from '../i18n'
import { weekNumber } from '../issues/week'
import { formatDate, groupBySection, safeHref, type Links, type RenderIssue } from '../render/shared'
import { THEME_CSS } from './tokens'

// System fonts only: the CSP forbids external fonts.
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

const CSS = `${THEME_CSS}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.55 ${SANS}}
main{max-width:620px;margin:0 auto;padding:56px 20px 0;overflow-wrap:anywhere}
a{color:var(--accent)}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
h1{font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0 0 16px}
h2{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:44px 0 14px}
p{margin:0}
.masthead{font-size:22px;letter-spacing:-.01em;margin:0}
.kicker{font-size:14px;color:var(--muted);margin:4px 0 0}
.brand{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.lead{font-size:19px;line-height:1.5;margin:0}
.items{list-style:none;margin:0;padding:0}
.items li{margin:0 0 28px}
.items .title{font-size:19px;font-weight:600;line-height:1.3;color:var(--text);text-decoration:none}
.items .title:hover{text-decoration:underline}
.items p{margin:6px 0 6px;color:var(--muted);font-size:16px}
.more{font-size:15px;color:var(--accent);text-decoration:none}
.back{display:inline-block;font-size:15px;color:var(--accent);text-decoration:none;margin-bottom:28px}
.points{margin:0;padding-left:20px}
.points li{margin:8px 0}
pre{margin:10px 0 0;padding:14px 16px;background:var(--surface);color:var(--text);border-radius:12px;overflow-x:auto;font:14px/1.5 ${MONO}}
code{font-family:${MONO};font-size:.92em}
.btn{display:inline-block;margin-top:28px;padding:10px 18px;border-radius:980px;border:1px solid var(--accent);color:var(--accent);background:transparent;text-decoration:none;font:500 15px/1.2 ${SANS};cursor:pointer}
button.btn{background:var(--accent);color:var(--on-accent)}
button.btn.ghost{background:transparent;color:var(--text);border-color:var(--line);padding:6px 12px;font-size:14px;margin:0}
label{display:block;font-size:14px;font-weight:600;color:var(--muted);margin:16px 0 6px}
input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}
table{width:100%;border-collapse:collapse;font-size:15px;margin-top:8px}
td,th{text-align:left;padding:10px 6px;border-top:1px solid var(--line);vertical-align:top}
th{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-top:0}
.msg{padding:10px 14px;border-radius:10px;background:var(--surface);color:var(--text);margin:16px 0}
.msg.err{color:var(--error)}
.foot{max-width:620px;margin:72px auto 0;padding:20px 20px 40px;border-top:1px solid var(--line);font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between}
.foot a{color:var(--muted)}
.theme{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.theme[hidden]{display:none}
.theme span{margin-right:6px}
.theme button{font:inherit;font-size:13px;padding:4px 10px;border:0;border-radius:980px;background:transparent;color:var(--muted);cursor:pointer}
.theme button[aria-pressed="true"]{background:var(--surface);color:var(--text)}
`

/** Shared by every page. The footer holds the page's own links and the theme choice (hidden until the script runs). */
export function Layout(props: {
  lang: string
  title: string
  description?: string
  theme?: string
  footer?: Child
  children: Child
}) {
  return (
    <html lang={props.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="color-scheme" content="light dark" />
        {props.description ? <meta name="description" content={props.description} /> : null}
        <title>{props.title}</title>
        {/* Raw, not escaped: the stylesheet is a constant, and its quotes must reach the browser as written. */}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <script src={props.theme ?? '/theme.js'}></script>
      </head>
      <body>
        <main>{props.children}</main>
        <footer class="foot">
          {props.footer}
          <ThemePicker lang={props.lang === 'en' ? 'en' : 'fr'} />
        </footer>
      </body>
    </html>
  )
}

function ThemePicker(props: { lang: 'fr' | 'en' }) {
  const t = LABELS[props.lang]
  return (
    <div class="theme" id="theme-picker" role="group" aria-label={t.theme} hidden>
      <span>{t.theme}</span>
      <button type="button" data-theme-choice="auto">
        {t.themeAuto}
      </button>
      <button type="button" data-theme-choice="light">
        {t.themeLight}
      </button>
      <button type="button" data-theme-choice="dark">
        {t.themeDark}
      </button>
    </div>
  )
}

export function IssuePage(props: { issue: RenderIssue; links: Links }) {
  const { issue, links } = props
  const t = LABELS[issue.language]
  return (
    <Layout
      lang={issue.language}
      title={`${BRAND} #${weekNumber(issue.id)}`}
      description={t.tagline}
      theme={links.theme}
      footer={<a href={links.unsubscribe}>{t.unsubscribe}</a>}
    >
      <h1 class="masthead">{BRAND}</h1>
      <p class="kicker">{formatDate(issue.date, LOCALES[issue.language])}</p>
      {groupBySection(issue.items).map((group) => (
        <>
          {group.section ? <h2>{t.sections[group.section]}</h2> : null}
          <ul class="items">
            {group.items.map((it) => (
              <li>
                <a class="title" href={links.item(it.position)}>
                  {it.title}
                </a>
                <p>{it.summary}</p>
                <a class="more" href={links.item(it.position)}>
                  {t.readMore} →
                </a>
              </li>
            ))}
          </ul>
        </>
      ))}
    </Layout>
  )
}

export function ItemPage(props: { issue: RenderIssue; item: IssueItem; links: Links }) {
  const { issue, item, links } = props
  const t = LABELS[issue.language]
  const href = safeHref(item.sourceUrl)
  const d = item.details
  return (
    <Layout
      lang={issue.language}
      title={`${item.title} · ${BRAND}`}
      description={item.summary}
      theme={links.theme}
      footer={<a href={links.unsubscribe}>{t.unsubscribe}</a>}
    >
      <a class="back" href={links.issue}>
        ← {t.backToIssue}
      </a>
      <h1>{item.title}</h1>
      <p class="lead">{d.intro}</p>

      {d.key_points.length > 0 ? (
        <>
          <h2>{t.keyPoints}</h2>
          <ul class="points">
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
            <pre>
              <code>{c}</code>
            </pre>
          ))}
        </>
      ) : null}

      <h2>{t.whyItMatters}</h2>
      <p>{d.why_it_matters}</p>

      {href ? (
        <a class="btn" href={href} rel="noopener noreferrer" target="_blank">
          {t.source} ↗
        </a>
      ) : null}
    </Layout>
  )
}

export function NotFoundPage(props: { lang: 'fr' | 'en' }) {
  const t = LABELS[props.lang]
  return (
    <Layout lang={props.lang} title={`${t.notFound} · ${BRAND}`}>
      <span class="brand">{BRAND}</span>
      <h1>{t.notFound}</h1>
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
    </Layout>
  )
}

export async function renderPage(node: { toString(): string | Promise<string> }): Promise<string> {
  return `<!DOCTYPE html>${await node.toString()}`
}
