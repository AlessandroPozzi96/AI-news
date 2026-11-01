import { XMLParser } from 'fast-xml-parser'
import { gather } from './gather'
import { getText } from './http'
import { stripHtml, truncate } from './text'
import type { Candidate, Collector } from './types'

export type FeedSource = { name: string; url: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })

type XmlNode = string | { '#text'?: string; '@_href'?: string; '@_rel'?: string } | undefined

function text(node: XmlNode): string {
  if (node === undefined) return ''
  return typeof node === 'string' ? node : (node['#text'] ?? '')
}

function atomLink(node: XmlNode | XmlNode[]): string {
  const links = Array.isArray(node) ? node : [node]
  const objs = links.filter((l): l is Exclude<XmlNode, string | undefined> => typeof l === 'object' && l !== null)
  const alt = objs.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? objs[0]
  return alt?.['@_href'] ?? ''
}

type RawItem = Record<string, XmlNode | XmlNode[]>

export function parseFeed(xml: string, sourceName: string, since: Date): Candidate[] {
  const doc = parser.parse(xml)
  const rawItems: RawItem[] = [].concat(doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [])
  const out: Candidate[] = []
  for (const item of rawItems) {
    const date = new Date(
      text(item.pubDate as XmlNode) || text(item.published as XmlNode) || text(item.updated as XmlNode),
    )
    if (Number.isNaN(date.getTime()) || date < since) continue
    const url = atomLink(item.link) || text(item.link as XmlNode).trim()
    const title = stripHtml(text(item.title as XmlNode))
    if (!url || !title) continue
    const body = text(item.description as XmlNode) || text(item.summary as XmlNode) || text(item.content as XmlNode)
    out.push({
      title,
      url,
      excerpt: truncate(stripHtml(body), 500),
      source: sourceName,
      publishedAt: date.toISOString(),
    })
  }
  return out
}

export function rssFeeds(feeds: FeedSource[]): Collector {
  const byName = new Map(feeds.map((f) => [f.name, f]))
  return {
    name: 'rss',
    collect: (ctx) =>
      gather(
        feeds.map((f) => f.name),
        async (name) => {
          const feed = byName.get(name) as FeedSource
          const xml = await getText(ctx.fetch, feed.url, {
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          })
          return parseFeed(xml, feed.name, ctx.since)
        },
      ),
  }
}
