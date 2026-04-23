/**
 * Cron: Clinical Insight Engine — evaluate all opted-in patients every 4 hours.
 *
 * Setup:
 *   - vercel.json registers this path with a `0 STAR/4 STAR STAR STAR` schedule.
 *   - env CRON_SECRET must match Bearer header (Vercel auto-injects).
 *
 * Manual dev run: GET /api/cron/compute-insights (allowed without secret when
 * NODE_ENV !== 'production').
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeInsights } from '@/server/insights/compute'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return false
  return auth.slice(7) === secret
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const result = await computeInsights(prisma)
    const elapsedMs = Date.now() - startedAt
    return NextResponse.json({ ok: true, elapsedMs, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/compute-insights] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
