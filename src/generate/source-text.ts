import { getJson, getText } from '../collect/http'
import { stripHtml } from '../collect/text'

const MAX_CHARS = 12_000

function mainHtml(html: string): string {
  const match = html.match(/<(article|main)[\s\S]*?<\/\1>/i)
  return match ? match[0] : html
}

/** Plain text of the source page, giving the writer real material instead of a teaser. */
export async function fetchSourceText(doFetch: typeof fetch, url: string, fallback: string): Promise<string> {
  try {
    const text = await load(doFetch, url)
    return (text || fallback).slice(0, MAX_CHARS)
  } catch {
    return fallback
  }
}

async function load(doFetch: typeof fetch, url: string): Promise<string> {
  const release = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/tag\/(.+)$/)
  if (release) {
    const data = await getJson<{ body: string | null }>(
      doFetch,
      `https://api.github.com/repos/${release[1]}/releases/tags/${release[2]}`,
      { Accept: 'application/vnd.github+json' },
    )
    return data.body ?? ''
  }
  const repo = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/)
  if (repo) {
    return getText(doFetch, `https://raw.githubusercontent.com/${repo[1]}/HEAD/README.md`)
  }
  return stripHtml(mainHtml(await getText(doFetch, url, { Accept: 'text/html,text/plain' })))
}
