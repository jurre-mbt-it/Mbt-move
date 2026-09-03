/**
 * Versleuteling van het Kinvent-JWT at rest.
 *
 * Zelfde opzet als de Strava-tokens (src/server/wearables/strava/config.ts):
 * AES-256-GCM, prefix `enc:v1:`, sleutel afgeleid uit een env-secret die alleen
 * in de app leeft en niet in de database. Een database-dump zonder de env is
 * daarmee waardeloos, en dat is het punt: dit token geeft 31 dagen lang
 * toegang tot het hele Kinvent-account, inclusief hun schrijf-endpoints.
 *
 * Eigen secret (KINVENT_TOKEN_SECRET) en eigen afleiding, zodat de sleutel van
 * Strava en die van Kinvent nooit dezelfde zijn. Zet hem in Vercel en in
 * .env.local; een willekeurige string van 32+ tekens volstaat.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const secret = process.env.KINVENT_TOKEN_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('KINVENT_TOKEN_SECRET ontbreekt of is te kort (minimaal 16 tekens).')
  }
  return createHash('sha256').update(`kinvent-at-rest:${secret}`).digest()
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    throw new Error('Opgeslagen Kinvent-token heeft niet het verwachte formaat.')
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}

/**
 * Vervaldatum uit de exp-claim van het JWT. Kinvent geeft 31 dagen; we lezen
 * het uit het token zelf in plaats van dat getal hard te coderen.
 */
export function jwtExpiry(token: string): Date | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number }
    return typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null
  } catch {
    return null
  }
}
