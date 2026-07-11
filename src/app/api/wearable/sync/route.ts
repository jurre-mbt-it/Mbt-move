/**
 * POST /api/wearable/sync — ingestiepunt voor de native HealthKit-bridge.
 *
 * Auth: Supabase JWT als Bearer-token (mobiele client). We hergebruiken
 * `createTRPCContext` zodat exact dezelfde user-resolutie geldt als de rest
 * van de API. Health-data is bijzondere persoonsgegeven (AVG art. 9), dus
 * PATIENT/ATHLETE moeten de DPA hebben geaccepteerd voordat ze data sturen.
 *
 * Body: zie `syncPayloadSchema` (workouts + sleep + vitals + anchors). Alles
 * idempotent op de HealthKit-sample-UUID, dus retries/overlap zijn veilig.
 * Na ingestie wordt readiness herrekend voor elke geraakte dag.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTRPCContext } from '@/server/trpc'
import { DPA_VERSION } from '@/lib/dpa-constants'
import { ingestWearableData, syncPayloadSchema } from '@/server/wearables/ingest'
import { computeAndStoreReadiness } from '@/server/readiness'
import { wearablesEnabledForRole } from '@/lib/wearables-access'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Ruim vangnet: een chunk van de mobiele sync (zie healthkit.ts in de app)
// verwerkt in seconden, maar een chunk met veel readiness-herberekeningen mag
// niet op de functie-limiet klappen. NB: iOS kapt een request client-side na
// ~60s — de echte bescherming is de chunking in de app.
export const maxDuration = 120

const DPA_REQUIRED_ROLES = new Set(['PATIENT', 'ATHLETE'])

export async function POST(req: NextRequest) {
  const ctx = await createTRPCContext({ req })
  if (!ctx.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Uitrol-gate: voorlopig alleen admin (zie src/lib/wearables-access.ts).
  if (!wearablesEnabledForRole(ctx.user.role)) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 403 })
  }

  // Per-user rate-limit: begrenst sync-frequentie (anti-abuse / amplificatie).
  const rl = await rateLimit('wearable.sync', ctx.user.id, RATE_LIMITS.wearableSync)
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited', message: rl.message }, { status: 429 })
  }

  // DPA-gate voor patiënt/atleet (therapeut/admin tekenen buiten de app om).
  if (DPA_REQUIRED_ROLES.has(ctx.user.role)) {
    const u = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { dpaAcceptedVersion: true },
    })
    if (u?.dpaAcceptedVersion !== DPA_VERSION) {
      return NextResponse.json({ error: 'dpa_required' }, { status: 403 })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = syncPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const result = await ingestWearableData(prisma, ctx.user.id, parsed.data)

    // Readiness herrekenen voor elke geraakte dag (idempotent upsert).
    for (const date of result.affectedDates) {
      await computeAndStoreReadiness(prisma, ctx.user.id, date)
    }

    return NextResponse.json({
      ok: true,
      imported: {
        workouts: result.workouts,
        sleep: result.sleep,
        vitals: result.vitals,
      },
    })
  } catch (err) {
    // Detail blijft server-side; client krijgt een generieke melding (geen
    // info-disclosure van Prisma-/interne foutstrings).
    console.error('[wearable/sync] failed', err)
    return NextResponse.json({ ok: false, error: 'sync_failed' }, { status: 500 })
  }
}
