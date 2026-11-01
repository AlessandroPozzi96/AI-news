import { CATEGORIES, DetailsSchema, type IssueItem, type Language } from '../generate/types'

export type StoredIssue = {
  id: string
  language: Language
  status: string
  createdAt: string
  sentAt: string | null
  items: IssueItem[]
}

type IssueRow = { id: string; language: Language; status: string; created_at: string; sent_at: string | null }
type ItemRow = {
  position: number
  category: string
  title: string
  summary: string
  details_json: string
  source_url: string
  source_name: string
  claude_code: number
}

function toItem(row: ItemRow): IssueItem | null {
  const category = CATEGORIES.find((c) => c === row.category)
  const details = DetailsSchema.safeParse(JSON.parse(row.details_json))
  if (!category || !details.success) return null
  return {
    position: row.position,
    category,
    claudeCode: row.claude_code === 1,
    title: row.title,
    summary: row.summary,
    details: details.data,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
  }
}

export async function getIssue(db: D1Database, id: string): Promise<StoredIssue | null> {
  const issue = await db.prepare('SELECT * FROM issues WHERE id = ?').bind(id).first<IssueRow>()
  if (!issue) return null
  const { results } = await db
    .prepare('SELECT * FROM items WHERE issue_id = ? ORDER BY position')
    .bind(id)
    .all<ItemRow>()
  return {
    id: issue.id,
    language: issue.language,
    status: issue.status,
    createdAt: issue.created_at,
    sentAt: issue.sent_at,
    items: results.map(toItem).filter((i): i is IssueItem => i !== null),
  }
}

/** `sending` makes the public pages reachable (mails carry links); `sent` is terminal. */
export async function setIssueStatus(db: D1Database, id: string, status: 'sending' | 'sent'): Promise<void> {
  const sql =
    status === 'sent'
      ? "UPDATE issues SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
      : "UPDATE issues SET status = 'sending' WHERE id = ?"
  await db.prepare(sql).bind(id).run()
}

export const PUBLIC_STATUSES = ['sending', 'sent']

/** Saves (or re-saves) a draft issue. A sent issue is immutable: its public links must not change. */
export async function saveIssue(
  db: D1Database,
  id: string,
  language: Language,
  items: IssueItem[],
): Promise<void> {
  const existing = await db.prepare('SELECT status FROM issues WHERE id = ?').bind(id).first<{ status: string }>()
  if (existing && existing.status !== 'draft') throw new Error(`Issue ${id} is already ${existing.status}`)

  const insertItem = db.prepare(
    `INSERT INTO items (issue_id, position, category, title, summary, details_json, source_url, source_name, claude_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  await db.batch([
    db.prepare('INSERT INTO issues (id, language) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET language = excluded.language').bind(id, language),
    db.prepare('DELETE FROM items WHERE issue_id = ?').bind(id),
    ...items.map((it) =>
      insertItem.bind(
        id,
        it.position,
        it.category,
        it.title,
        it.summary,
        JSON.stringify(it.details),
        it.sourceUrl,
        it.sourceName,
        it.claudeCode ? 1 : 0,
      ),
    ),
  ])
}
