/**
 * Rate-limit helper.
 *
 * Gebruikt Upstash Redis wanneer `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * gezet zijn. Anders valt het terug op een in-memory store — goed genoeg voor dev
 * en voor single-instance serverless (Vercel). Niet geschikt voor multi-region.
 *
 * Gebruik in een tRPC procedure:
 * ```ts
 *   const rl = await rateLimit('invite.create', ctx.user.id, { max: 10, windowSec: 3600 })
 *   if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
 * ```
 */

type LimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
  message?: string
}

type MemoryEntry = { count: number; resetAt: number }

const memoryStore = new Map<string, MemoryEntry>()

type UpstashClient = {
  incrByWithTTL: (key: string, ttl: number) => Promise<number>
} | null

let upstash: UpstashClient = null
let upstashInitAttempted = false

async function getUpstash(): Promise<UpstashClient> {
  if (upstashInitAttempted) return upstash
  upstashInitAttempted = true

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    // Dynamic import — package is optional; TS moet niet klagen als het niet
    // geinstalleerd is. Vandaar de `Function`-wrapper (wordt runtime opgelost).
    const dynImport = new Function('m', 'return import(m)') as (
      m: string,
    ) => Promise<unknown>
    const mod = (await dynImport('@upstash/redis').catch(() => null)) as
      | { Redis: new (opts: { url: string; token: string }) => {
          pipeline: () => { incr: (k: string) => void; expire: (k: string, s: number) => void; exec: () => Promise<unknown[]> }
        } }
      | null
    if (!mod) return null
    const redis = new mod.Redis({ url, token })
    upstash = {
      async incrByWithTTL(key: string, ttl: number) {
        const pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl)
        const result = (await pipe.exec()) as [number, number]
        return result[0]
      },
    }
    return upstash
  } catch {
    return null
  }
}

export interface RateLimitOpts {
  max: number          // maximum aantal calls
  windowSec: number    // binnen hoeveel seconden
  message?: string     // custom error-bericht
}

/**
 * Check of `identifier` binnen de limiet zit voor `bucket`.
 * Return `{ ok: false }` als de limiet overschreden is.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  opts: RateLimitOpts,
): Promise<LimitResult> {
  const { max, windowSec, message } = opts
  const key = `rl:${bucket}:${identifier}`
  const now = Date.now()

  const client = await getUpstash()

  let count: number
  let resetAt: number

  if (client) {
    count = await client.incrByWithTTL(key, windowSec)
    resetAt = now + windowSec * 1000
  } else {
    const existing = memoryStore.get(key)
    if (existing && existing.resetAt > now) {
      existing.count += 1
      count = existing.count
      resetAt = existing.resetAt
    } else {
      const entry: MemoryEntry = { count: 1, resetAt: now + windowSec * 1000 }
      memoryStore.set(key, entry)
      count = 1
      resetAt = entry.resetAt
    }
    // Garbage-collect af en toe
    if (memoryStore.size > 5000) {
      for (const [k, v] of memoryStore.entries()) {
        if (v.resetAt < now) memoryStore.delete(k)
      }
    }
  }

  const remaining = Math.max(0, max - count)
  const ok = count <= max
  return {
    ok,
    remaining,
    resetAt,
    message:
      message ??
      (ok ? undefined : `Te veel pogingen. Probeer het later opnieuw.`),
  }
}

/**
 * Standaard buckets gebruikt door de app. Eén plek zodat je ze makkelijk tunt.
 */
export const RATE_LIMITS = {
  inviteCreate:       { max: 20, windowSec: 3600, message: 'Max 20 uitnodigingen per uur.' },
  inviteRedeem:       { max: 5,  windowSec: 900,  message: 'Te vaak geprobeerd. Wacht 15 minuten.' },
  dataExport:         { max: 3,  windowSec: 3600, message: 'Max 3 data-exports per uur.' },
  accountDeletion:    { max: 3,  windowSec: 86400, message: 'Max 3 verwijder-verzoeken per dag.' },
  consentChange:      { max: 10, windowSec: 3600, message: 'Max 10 consent-wijzigingen per uur.' },
  sessionLog:         { max: 60, windowSec: 3600, message: 'Max 60 sessies per uur gelogd.' },
} as const
