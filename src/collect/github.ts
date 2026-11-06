import { gather } from './gather'
import { getJson } from './http'
import { stripHtml, truncate } from './text'
import type { CollectContext, Collector } from './types'

function githubHeaders(ctx: CollectContext): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (ctx.githubToken) headers.Authorization = `Bearer ${ctx.githubToken}`
  return headers
}

type Release = {
  name: string | null
  tag_name: string
  html_url: string
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
}

const NIGHTLY = /nightly|preview|canary|alpha/i

export function githubReleases(repos: string[]): Collector {
  return {
    name: 'github-releases',
    collect: (ctx) =>
      gather(repos, async (repo) => {
        const releases = await getJson<Release[]>(
          ctx.fetch,
          `https://api.github.com/repos/${repo}/releases?per_page=10`,
          githubHeaders(ctx),
        )
        return releases
          .filter(
            (r) =>
              !r.draft &&
              !r.prerelease &&
              !NIGHTLY.test(r.tag_name) &&
              r.published_at &&
              new Date(r.published_at) >= ctx.since,
          )
          .map((r) => ({
            title: `${repo} ${r.name || r.tag_name}`,
            url: r.html_url,
            excerpt: truncate(stripHtml(r.body ?? ''), 600),
            source: `github:${repo}`,
            publishedAt: r.published_at as string,
          }))
      }),
  }
}

type RepoSearchResponse = {
  items: {
    full_name: string
    html_url: string
    description: string | null
    stargazers_count: number
    created_at: string
  }[]
}

export function githubTrending(topics: string[], minStars: number): Collector {
  return {
    name: 'github-trending',
    collect: (ctx) =>
      gather(topics, async (topic) => {
        const since = ctx.since.toISOString().slice(0, 10)
        const q = encodeURIComponent(`topic:${topic} created:>${since} stars:>=${minStars}`)
        const data = await getJson<RepoSearchResponse>(
          ctx.fetch,
          `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`,
          githubHeaders(ctx),
        )
        return data.items.map((r) => ({
          title: r.full_name,
          url: r.html_url,
          excerpt: truncate(r.description ?? '', 300),
          source: `github-topic:${topic}`,
          publishedAt: r.created_at,
          metrics: { stars: r.stargazers_count },
        }))
      }),
  }
}

export const POPULAR_SOURCE_PREFIX = 'github-popular:'

/**
 * Well-established repositories of the topics, by stars, with no creation date filter: they are
 * undated (evergreen). Recent activity is required so that abandoned repositories are left out.
 */
export function githubPopular(
  topics: string[],
  options: { minStars: number; activeWithinDays: number },
): Collector {
  return {
    name: 'github-popular',
    collect: (ctx) =>
      gather(topics, async (topic) => {
        const pushed = new Date(Date.now() - options.activeWithinDays * 86_400_000).toISOString().slice(0, 10)
        const q = encodeURIComponent(`topic:${topic} stars:>=${options.minStars} pushed:>${pushed}`)
        const data = await getJson<RepoSearchResponse>(
          ctx.fetch,
          `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`,
          githubHeaders(ctx),
        )
        return data.items.map((r) => ({
          title: r.full_name,
          url: r.html_url,
          excerpt: truncate(r.description ?? '', 300),
          source: `${POPULAR_SOURCE_PREFIX}${topic}`,
          publishedAt: '',
          evergreen: true,
          metrics: { stars: r.stargazers_count },
        }))
      }),
  }
}
