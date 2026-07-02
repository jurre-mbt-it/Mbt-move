/**
 * Cron: herbereken de readiness-momentopname van vandaag voor elke gebruiker
 * met een actieve wearable-koppeling. Nodig omdat de rollende HRV/RHR-baseline
 * en de subjectieve wellness-check ook veranderen zónder nieuwe HealthKit-sync
 * — zo blijft de trend/cohort-grafiek kloppen.
 *
 * Setup: vercel.json registreert dit pad; CRON_SECRET moet matchen (Vercel
 * injecteert die als Bearer). Dev: GET zonder secret als NODE_ENV !== production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeAndStoreReadiness } from '@/server/readiness'
import { authorizeCron } from '@/server/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!authorizeCron(req, { allowDevFallback: true })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const connections = await prisma.wearableConnection.findMany({
      where: { enabled: true },
      select: { userId: true },
    })
    let computed = 0
    for (const c of connections) {
      try {
        const r = await computeAndStoreReadiness(prisma, c.userId)
        if (r.score != null) computed++
      } catch (err) {
        console.error('[cron/sync-readiness] user failed', c.userId, err)
      }
    }
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      connections: connections.length,
      computed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/sync-readiness] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
