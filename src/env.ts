/** Bindings of the Worker, which only serves the web side (pages, unsubscribe, admin). */
export type Env = {
  DB: D1Database
  UNSUBSCRIBE_SECRET: string
  /** Dashboard login token; the admin routes answer 404 until it is set (>= 16 chars). */
  ADMIN_TOKEN?: string
  /** Fine-grained GitHub token limited to this repo (Actions: read and write), for "Envoyer maintenant". */
  GH_DISPATCH_TOKEN?: string
  /** `owner/repo` of the newsletter repository, where the workflow is dispatched. */
  GITHUB_REPO?: string
}
