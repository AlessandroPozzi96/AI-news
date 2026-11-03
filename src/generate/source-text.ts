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

type HnNode = { text?: string | null; children?: HnNode[] }

const MAX_COMMENTS = 15
const MAX_DEPTH = 6

function flatten(node: HnNode, out: string[], depth = 0): void {
  if (out.length >= MAX_COMMENTS || depth > MAX_DEPTH) return
  if (node.text) out.push(stripHtml(node.text))
  for (const child of node.children ?? []) flatten(child, out, depth + 1)
}

/** Text of a Hacker News thread (story text, then comments), empty when unavailable. */
export async function fetchDiscussion(doFetch: typeof fetch, discussionUrl: string): Promise<string> {
  const id = discussionUrl.match(/[?&]id=(\d+)/)?.[1]
  if (!id) return ''
  try {
    const root = await getJson<HnNode>(doFetch, `https://hn.algolia.com/api/v1/items/${id}`)
    const parts: string[] = []
    flatten(root, parts)
    return parts.join('\n\n').slice(0, MAX_CHARS)
  } catch {
    return ''
  }
}
