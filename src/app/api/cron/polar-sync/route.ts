/**
 * Cron: dagelijkse Polar-sync als vangnet voor gemiste webhooks. De webhook
 * (POST /api/wearable/polar/webhook) is de primaire route; deze cron dekt
 * gemiste events én de situatie dat Polar de webhook na 7 dagen fouten heeft
 * gedeactiveerd (scripts/polar-webhook-setup.ts activate zet 'm dan terug).
 *
 * Setup: vercel.json registreert dit pad; CRON_SECRET moet matchen (Vercel
 * injecteert die als Bearer). Dev: GET zonder secret als NODE_ENV !== production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncPolarExercises, syncPolarWellness } from '@/server/wearables/polar/sync'
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
    // needsReauth-koppelingen overslaan: zonder geldig token is elke poging
    // een gegarandeerde 401 — de gebruiker moet eerst opnieuw koppelen.
    const connections = await prisma.polarConnection.findMany({
      where: { needsReauth: false },
      select: { userId: true },
    })
    let synced = 0
    let failed = 0
    for (const c of connections) {
      try {
        await syncPolarExercises(prisma, c.userId)
        await syncPolarWellness(prisma, c.userId)
        synced++
      } catch (err) {
        // Eén kapot token mag de rest niet blokkeren.
        failed++
        console.error('[cron/polar-sync] user failed', c.userId, err)
      }
    }
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      connections: connections.length,
      synced,
      failed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/polar-sync] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
