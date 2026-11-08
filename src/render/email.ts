import type { IssueItem } from '../generate/types'
import { BRAND, LABELS, LOCALES } from '../i18n'
import { weekNumber } from '../issues/week'
import { formatDate, groupBySection, type Links, type RenderIssue } from './shared'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export type RenderedEmail = { subject: string; html: string; text: string }

// Inline styles and tables only: Gmail and Outlook strip stylesheets. Light by design, no theme switch.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = '#1d1d1f'
const MUTED = '#6e6e73'
const LINE = '#e5e5ea'
const ACCENT = '#0066cc'

export function renderEmail(issue: RenderIssue, links: Links): RenderedEmail {
  const t = LABELS[issue.language]
  const week = weekNumber(issue.id)
  const dateText = formatDate(issue.date, LOCALES[issue.language])
  const first = issue.items[0]
  const subject = first ? `${BRAND} #${week} — ${first.title}` : `${BRAND} #${week}`
  const preheader = first?.summary ?? t.tagline

  const itemHtml = (it: IssueItem) => `<tr><td style="padding:0 0 26px;">
  <div style="font-size:17px;line-height:1.35;font-weight:600;color:${INK};">${esc(it.title)}</div>
  <div style="margin-top:6px;font-size:15px;line-height:1.55;color:${MUTED};">${esc(it.summary)}</div>
  <div style="margin-top:8px;"><a href="${esc(links.item(it.position))}" style="font-size:14px;color:${ACCENT};text-decoration:none;">${esc(t.readMore)} &rarr;</a></div>
</td></tr>`

  // Sections are headed only when the issue has them (older issues have none).
  const itemsHtml = groupBySection(issue.items)
    .map((group) => {
      const heading = group.section
        ? `<tr><td style="padding:12px 0 14px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(t.sections[group.section])}</td></tr>`
        : ''
      return heading + group.items.map(itemHtml).join('\n')
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="${issue.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;font-family:${FONT};color:${INK};">
<tr><td style="padding:0 0 36px;">
  <div style="font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-.01em;color:${INK};">${esc(BRAND)}</div>
  <div style="margin-top:4px;font-size:14px;color:${MUTED};">${esc(dateText)}</div>
</td></tr>
${itemsHtml}
<tr><td style="padding:24px 0 0;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
  <a href="${esc(links.issue)}" style="color:${MUTED};">${esc(t.viewInBrowser)}</a>
  &nbsp;·&nbsp;
  <a href="${esc(links.unsubscribe)}" style="color:${MUTED};">${esc(t.unsubscribe)}</a>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`

  const text = [
    `${BRAND} — ${dateText}`,
    '',
    ...groupBySection(issue.items).flatMap((group) => [
      ...(group.section ? [`== ${t.sections[group.section]} ==`, ''] : []),
      ...group.items.flatMap((it) => [it.title, it.summary, `${t.readMore}: ${links.item(it.position)}`, '']),
    ]),
    `${t.viewInBrowser}: ${links.issue}`,
    `${t.unsubscribe}: ${links.unsubscribe}`,
  ].join('\n')

  return { subject, html, text }
}
