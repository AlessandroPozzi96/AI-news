import type { MailMessage, MailResult, Mailer } from './types'

export const BATCH_SIZE = 100

export function resendMailer(apiKey: string, from: string, doFetch: typeof fetch = fetch): Mailer {
  return {
    async sendBatch(messages: MailMessage[], idempotencyKey: string): Promise<MailResult[]> {
      if (messages.length === 0) return []
      if (messages.length > BATCH_SIZE) throw new Error(`Resend batches are limited to ${BATCH_SIZE} messages`)
      const res = await doFetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(
          messages.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers })),
        ),
        signal: AbortSignal.timeout(30_000),
      })
      const body = await res.text()
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 300)}`)
      const data = (JSON.parse(body) as { data?: { id: string }[] }).data ?? []
      return messages.map((_, i) => (data[i]?.id ? { id: data[i].id } : { error: 'no id returned by Resend' }))
    },
  }
}
