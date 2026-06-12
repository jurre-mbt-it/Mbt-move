/**
 * GET /api/wearable/mock — dev-only seeder. Vult de ingelogde gebruiker met
 * 30 dagen mock-HealthKit-data via dezelfde ingestie-pijplijn als de echte
 * sync, zodat de web-dashboards getest kunnen worden zonder de native bridge.
 * 404 in productie. Optioneel: ?days=30.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTRPCContext } from '@/server/trpc'
import { ingestWearableData } from '@/server/wearables/ingest'
import { computeAndStoreReadiness } from '@/server/readiness'
import { mockSyncPayload } from '@/lib/wearable-mock'
import { wearablesEnabledForRole } from '@/lib/wearables-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const ctx = await createTRPCContext({ req })
  if (!ctx.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!wearablesEnabledForRole(ctx.user.role)) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 403 })
  }
  const days = Math.min(90, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 30))
  const payload = mockSyncPayload(days)
  const result = await ingestWearableData(prisma, ctx.user.id, payload)
  for (const date of result.affectedDates) {
    await computeAndStoreReadiness(prisma, ctx.user.id, date)
  }
  return NextResponse.json({ ok: true, seededFor: ctx.user.email, imported: result })
}
