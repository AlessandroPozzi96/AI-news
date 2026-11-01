import { BRAND, LABELS, LOCALES } from '../i18n'
import { weekNumber } from '../issues/week'
import { formatDate, type Links, type RenderIssue } from './shared'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export type RenderedEmail = { subject: string; html: string; text: string }

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function renderEmail(issue: RenderIssue, links: Links): RenderedEmail {
  const t = LABELS[issue.language]
  const week = weekNumber(issue.id)
  const dateText = formatDate(issue.date, LOCALES[issue.language])
  const first = issue.items[0]
  const subject = first ? `${BRAND} #${week} — ${first.title}` : `${BRAND} #${week}`
  const preheader = first?.summary ?? t.tagline

  const itemsHtml = issue.items
    .map((it) => {
      const url = esc(links.item(it.position))
      const badges = [
        `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;">${esc(t.categories[it.category])}</span>`,
        it.claudeCode
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#fff1e6;color:#9a3412;font-size:11px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;margin-left:6px;">${esc(t.claudeCode)}</span>`
          : '',
      ].join('')
      return `<tr><td style="padding:22px 0;border-top:1px solid #e5e7eb;">
  <div style="margin-bottom:8px;">${badges}</div>
  <a href="${url}" style="font-size:19px;line-height:1.3;font-weight:700;color:#111827;text-decoration:none;">${it.position}. ${esc(it.title)}</a>
  <p style="margin:8px 0 10px;font-size:15px;line-height:1.55;color:#374151;">${esc(it.summary)}</p>
  <a href="${url}" style="font-size:14px;font-weight:600;color:#4338ca;text-decoration:none;">${esc(t.readMore)} &rarr;</a>
</td></tr>`
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
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;font-family:${FONT};">
<tr><td style="padding:28px 28px 8px;">
  <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">${esc(t.weekLabel)} ${week} · ${esc(dateText)}</div>
  <div style="font-size:26px;font-weight:800;color:#111827;margin-top:4px;">${esc(BRAND)}</div>
  <div style="font-size:14px;color:#6b7280;margin-top:4px;">${esc(t.tagline)}</div>
</td></tr>
<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${itemsHtml}
</table></td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">
  <a href="${esc(links.issue)}" style="color:#6b7280;">${esc(t.viewInBrowser)}</a><br>
  ${esc(t.footerNote)} <a href="${esc(links.unsubscribe)}" style="color:#6b7280;">${esc(t.unsubscribe)}</a>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`

  const text = [
    `${BRAND} — ${t.weekLabel} ${week} (${dateText})`,
    t.tagline,
    '',
    ...issue.items.flatMap((it) => [
      `${it.position}. ${it.title} [${t.categories[it.category]}]`,
      it.summary,
      `${t.readMore}: ${links.item(it.position)}`,
      '',
    ]),
    `${t.viewInBrowser}: ${links.issue}`,
    `${t.unsubscribe}: ${links.unsubscribe}`,
  ].join('\n')

  return { subject, html, text }
}
