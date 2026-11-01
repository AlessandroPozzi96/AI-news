export type Env = {
  DB: D1Database
  /** Public origin used in e-mail links, e.g. https://ai-news.example.workers.dev */
  PUBLIC_BASE_URL: string
  MAIL_FROM: string
  ANTHROPIC_API_KEY: string
  RESEND_API_KEY: string
  UNSUBSCRIBE_SECRET: string
  ADMIN_EMAIL?: string
  GITHUB_TOKEN?: string
}
