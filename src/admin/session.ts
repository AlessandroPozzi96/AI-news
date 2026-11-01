const enc = new TextEncoder()

export const SESSION_COOKIE = 'admin_session'
export const SESSION_TTL_SECONDS = 7 * 24 * 3600

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, enc.encode(message))
}

/** Constant-time comparison: both sides are HMAC'd first so the compared lengths never leak the secret's. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac('compare', a), hmac('compare', b)])
  const bx = new Uint8Array(x)
  const by = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < bx.length; i++) diff |= bx[i] ^ by[i]
  return diff === 0
}

/** Session value `<expiryEpochSeconds>.<hmac>`: stateless, signed with the admin token, so changing the token logs everyone out. */
export async function createSession(adminToken: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS
  return `${exp}.${hex(await hmac(adminToken, `admin-session:${exp}`))}`
}

export async function verifySession(adminToken: string, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false
  const [expPart, sig, ...rest] = value.split('.')
  if (!expPart || !sig || rest.length > 0 || !/^\d+$/.test(expPart)) return false
  if (Number(expPart) < Math.floor(now / 1000)) return false
  return safeEqual(sig, hex(await hmac(adminToken, `admin-session:${expPart}`)))
}
