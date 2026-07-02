import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Constant-time string-vergelijking — voorkomt een timing-side-channel op het
 *  CRON_SECRET. Ongelijke lengtes falen meteen (lengte is geen geheim). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Autoriseer een Vercel-cron request tegen `CRON_SECRET` (Bearer-header).
 *
 * `allowDevFallback` (default false): sta een GET zonder secret toe wanneer
 * CRON_SECRET niet gezet is én NODE_ENV !== 'production' — handig voor
 * non-destructieve crons tijdens lokale dev. Destructieve crons (bv.
 * account-verwijdering) laten dit op false staan en zijn zo volledig
 * fail-closed. Vercel zet NODE_ENV=production ook op preview, dus preview is
 * altijd dicht.
 */
export function authorizeCron(
  req: NextRequest,
  opts: { allowDevFallback?: boolean } = {},
): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return opts.allowDevFallback === true && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return false
  return safeEqual(auth.slice(7), secret)
}
