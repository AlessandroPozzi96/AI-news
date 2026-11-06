import { USER_AGENT } from '../collect/http'

/**
 * Asks GitHub Actions to run the newsletter workflow in `force` mode, which generates and sends a new
 * manual issue. The Worker cannot run the pipeline itself (CPU limit, no LLM or mail key).
 */
export async function dispatchNewsletter(doFetch: typeof fetch, repo: string, token: string): Promise<void> {
  const res = await doFetch(`https://api.github.com/repos/${repo}/actions/workflows/newsletter.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'master', inputs: { force: 'true' } }),
  })
  // The response body is not included: it never needs to reach the logs or the page.
  if (!res.ok) throw new Error(`GitHub workflow dispatch failed with HTTP ${res.status}`)
}
