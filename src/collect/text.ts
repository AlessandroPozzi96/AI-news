const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

const TRACKING_PARAM = /^(utm_|ref$|ref_src$|fbclid$|gclid$)/i

export function normalizeUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return raw.trim()
  }
  u.hash = ''
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key)
  }
  u.searchParams.sort()
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname
  const query = u.searchParams.toString()
  return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ''}`
}
