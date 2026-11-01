import { githubReleases, githubTrending } from './github'
import { hackerNews } from './hackernews'
import { rssFeeds } from './rss'
import type { Collector } from './types'

export const GITHUB_RELEASE_REPOS = [
  'anthropics/claude-code',
  'anthropics/claude-agent-sdk-python',
  'anthropics/claude-agent-sdk-typescript',
  'openai/codex',
  'google-gemini/gemini-cli',
  'modelcontextprotocol/modelcontextprotocol',
  'modelcontextprotocol/typescript-sdk',
]

export const GITHUB_TRENDING_TOPICS = ['claude-code', 'mcp-server', 'agent-skills', 'claude-skills']

export const HN_QUERIES = ['claude code', 'coding agent', 'mcp server', 'ai agents software']

export const RSS_FEEDS = [
  // No official Anthropic feed exists; this is a community mirror of anthropic.com/news.
  { name: 'anthropic-news', url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml' },
  { name: 'openai-news', url: 'https://openai.com/news/rss.xml' },
  { name: 'google-ai-blog', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'google-developers-blog', url: 'https://blog.google/technology/developers/rss/' },
  { name: 'cursor-changelog', url: 'https://cursor.com/changelog/rss.xml' },
  { name: 'github-changelog', url: 'https://github.blog/changelog/feed/' },
  { name: 'simon-willison', url: 'https://simonwillison.net/atom/everything/' },
  { name: 'latent-space', url: 'https://www.latent.space/feed' },
  // Reddit rate-limits aggressively (429) and may block Cloudflare IPs: treat as best effort.
  { name: 'reddit-claudeai', url: 'https://www.reddit.com/r/ClaudeAI/top/.rss?t=week' },
  { name: 'reddit-claudecode', url: 'https://www.reddit.com/r/ClaudeCode/top/.rss?t=week' },
]

export const COLLECTORS: Collector[] = [
  githubReleases(GITHUB_RELEASE_REPOS),
  githubTrending(GITHUB_TRENDING_TOPICS, 20),
  hackerNews(HN_QUERIES, 50),
  rssFeeds(RSS_FEEDS),
]
