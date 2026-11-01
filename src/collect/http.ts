export const USER_AGENT = 'ai-news-bot/0.1 (+https://github.com/ai-news)'

const TIMEOUT_MS = 15_000

export async function getText(
  doFetch: typeof fetch,
  url: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const res = await doFetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

export async function getJson<T>(
  doFetch: typeof fetch,
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  return JSON.parse(await getText(doFetch, url, { Accept: 'application/json', ...headers })) as T
}
