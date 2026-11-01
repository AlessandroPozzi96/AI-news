declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
    UNSUBSCRIBE_SECRET: string
    ADMIN_TOKEN: string
  }
}
