/**
 * Cron: dagelijkse Strava-sync als vangnet voor gemiste webhook-events. De
 * webhook (POST /api/wearable/strava/webhook) is de primaire route; deze cron
 * dekt gemiste events, activiteiten die de webhook door de rate-limit of een
 * tijdelijke fout niet verwerkte, en de periode vóórdat de subscription
 * geregistreerd was. Ook het vangnet voor een gemist deauthorize-event: weigert
 * Strava het token (401, of refresh invalid_grant), dan is de toegang bij
 * Strava ingetrokken en gaat de koppeling hier ook weg. Dat is de enige plek
 * waar de cron verwijdert, en alleen op gezag van Strava zelf. Venster bewust kort (7 dagen): 1 lijst-call per
 * gebruiker, streams alleen voor wat in dat venster valt.
 *
 * Setup: vercel.json registreert dit pad; CRON_SECRET moet matchen (Vercel
 * injecteert die als Bearer). Dev: GET zonder secret als NODE_ENV !== production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isStravaAuthError, syncStravaActivities } from '@/server/wearables/strava/sync'
import { authorizeCron } from '@/server/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!authorizeCron(req, { allowDevFallback: true })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const connections = await prisma.stravaConnection.findMany({ select: { userId: true } })
    let synced = 0
    let failed = 0
    let deauthorized = 0
    let activities = 0
    for (const c of connections) {
      try {
        activities += await syncStravaActivities(prisma, c.userId, { days: 7 })
        synced++
      } catch (err) {
        if (isStravaAuthError(err)) {
          // Strava zelf weigert het token: toegang is daar ingetrokken.
          await prisma.stravaConnection.deleteMany({ where: { userId: c.userId } })
          await prisma.wearableConnection.deleteMany({ where: { userId: c.userId, provider: 'STRAVA' } })
          deauthorized++
          console.info('[cron/strava-sync] koppeling verwijderd, token ingetrokken bij Strava', c.userId)
          continue
        }
        // Eén kapotte sync mag de rest niet blokkeren.
        failed++
        console.error('[cron/strava-sync] user failed', c.userId, err)
      }
    }
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      connections: connections.length,
      synced,
      failed,
      deauthorized,
      activities,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/strava-sync] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
