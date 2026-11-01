const enc = new TextEncoder()

const b64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const key = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

/** Unsubscribe token: `<subscriberId>.<hmac>`; carries no personal data and cannot be forged without the secret. */
export async function signUnsubscribeToken(secret: string, subscriberId: number): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(`unsubscribe:${subscriberId}`))
  return `${subscriberId}.${b64url(sig)}`
}

export async function verifyUnsubscribeToken(secret: string, token: string): Promise<number | null> {
  const [idPart, sigPart, ...rest] = token.split('.')
  if (!idPart || !sigPart || rest.length > 0 || !/^\d+$/.test(idPart)) return null
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await key(secret, 'verify'),
      fromB64url(sigPart),
      enc.encode(`unsubscribe:${idPart}`),
    )
    return ok ? Number(idPart) : null
  } catch {
    return null
  }
}
