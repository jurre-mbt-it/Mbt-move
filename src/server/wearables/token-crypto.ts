/**
 * Gedeelde crypto-helpers voor wearable-integraties (Strava, Polar, …):
 * OAuth-state-signing, de verzegelde token-handoff (callback → app) en de
 * at-rest-versleuteling van tokens in de DB.
 *
 * Geëxtraheerd uit strava/config.ts; de formaten zijn byte-voor-byte
 * identiek gebleven zodat bestaande DB-rijen en lopende OAuth-flows blijven
 * werken:
 *  - state:  `base64url(userId.exp)` + "." + HMAC-SHA256(payload, secret)
 *  - blob:   base64url(iv|tag|ciphertext) met `exp` in de JSON (AES-256-GCM)
 *  - at rest: "enc:v1:" + base64url(iv|tag|ciphertext) (AES-256-GCM)
 *
 * De sleutel-afleiding blijft bewust bij de provider-config (bv.
 * sha256Key(clientSecret) voor de handoff, sha256Key('strava-at-rest:' +
 * clientSecret) at rest) zodat providers nooit elkaars sleutels delen.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/** SHA-256 van een string als 32-byte sleutel voor AES-256-GCM. */
export function sha256Key(input: string): Buffer {
  return createHash('sha256').update(input).digest()
}

// ── State signing (HMAC met het provider-secret) ─────────────────────────────

export function signState(secret: string, userId: string, ttlMs: number): string {
  const payload = `${userId}.${Date.now() + ttlMs}`
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

/** Verifieer de state en geef de userId terug, of null bij ongeldig/verlopen. */
export function verifyState(secret: string, state: string | null | undefined): string | null {
  if (!state) return null
  const [payloadB64, sig] = state.split('.')
  if (!payloadB64 || !sig) return null
  let payload: string
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString()
  } catch {
    return null
  }
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [userId, expStr] = payload.split('.')
  if (!userId || !expStr || Date.now() > Number(expStr)) return null
  return userId
}

// ── Verzegelde blob: callback → app (AES-256-GCM, met TTL) ──────────────────

/** Versleutel een JSON-payload voor de deep-link terug naar de app. */
export function sealJson(key: Buffer, payload: Record<string, unknown>, ttlMs: number): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = JSON.stringify({ ...payload, exp: Date.now() + ttlMs })
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

/** Ontsleutel + valideer de blob; null bij ongeldig/verlopen/geknoeid. */
export function openJson(key: Buffer, blob: string | null | undefined): Record<string, unknown> | null {
  if (!blob) return null
  try {
    const raw = Buffer.from(blob, 'base64url')
    if (raw.length < 12 + 16 + 2) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plain) as Record<string, unknown> & { exp?: number }
    if (!parsed.exp || Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}

// ── Token-versleuteling AT REST (AES-256-GCM) ───────────────────────────────
// Tokens worden versleuteld in de DB opgeslagen zodat een database-dump of
// backup-lek geen bruikbare API-tokens prijsgeeft. De sleutel leeft alleen in
// de app-env (afgeleid van het provider-client-secret), niet in de database.

const AT_REST_PREFIX = 'enc:v1:'

/** Versleutel een token voor opslag in de DB. */
export function encryptAtRest(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return AT_REST_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64url')
}

/**
 * Ontsleutel een uit de DB gelezen token. Backward-compat: rijen van vóór de
 * versleuteling staan als plaintext opgeslagen (geen prefix) en worden
 * ongewijzigd teruggegeven — ze versleutelen vanzelf bij de eerstvolgende
 * token-write.
 */
export function decryptAtRest(key: Buffer, stored: string): string {
  if (!stored.startsWith(AT_REST_PREFIX)) return stored
  const raw = Buffer.from(stored.slice(AT_REST_PREFIX.length), 'base64url')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
