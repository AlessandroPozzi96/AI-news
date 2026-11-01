import type { Candidate, CollectOutput } from './types'

/** Runs one task per label in parallel; a failing label is reported, never fatal. */
export async function gather(
  labels: string[],
  task: (label: string) => Promise<Candidate[]>,
): Promise<CollectOutput> {
  const results = await Promise.allSettled(labels.map(task))
  const out: CollectOutput = { candidates: [], errors: [] }
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.candidates.push(...r.value)
    else out.errors.push(`${labels[i]}: ${(r.reason as Error).message}`)
  })
  return out
}
