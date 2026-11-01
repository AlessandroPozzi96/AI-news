export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export type MailResult = { id?: string; error?: string }

export interface Mailer {
  /** Sends up to 100 messages; the result array matches the input order. */
  sendBatch(messages: MailMessage[], idempotencyKey: string): Promise<MailResult[]>
}
