/** Bindings of the Worker, which only serves the web side (pages, unsubscribe, admin). */
export type Env = {
  DB: D1Database
  UNSUBSCRIBE_SECRET: string
  /** Dashboard login token; the admin routes answer 404 until it is set (>= 16 chars). */
  ADMIN_TOKEN?: string
}
