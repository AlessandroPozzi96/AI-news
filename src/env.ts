/** Bindings of the Worker, which only serves the web side (pages, unsubscribe, admin). */
export type Env = {
  DB: D1Database
  UNSUBSCRIBE_SECRET: string
}
