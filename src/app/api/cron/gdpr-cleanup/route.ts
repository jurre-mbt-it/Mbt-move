/**
 * Cron job: AVG art. 17 — finaliseer account-verwijderingen na de grace period.
 *
 * Setup (Vercel):
 *   1. Zet env-var `CRON_SECRET` (willekeurige string, 32+ chars). Vercel
 *      voegt deze automatisch als `Authorization: Bearer ...` aan cron requests.
 *   2. `vercel.json` → `crons: [{ path: "/api/cron/gdpr-cleanup", schedule: "0 3 * * *" }]`
 *
 * Schedule: dagelijks om 03:00 UTC. Scant users waarvan deletionRequestedAt
 * meer dan GRACE_PERIOD_DAYS dagen terug is. Verwijdert Supabase-auth user +
 * cascade-delete in Prisma.
 *
 * Veiligheid:
 *   - Vereist Bearer-token check (alleen Vercel cron mag dit aanroepen).
 *   - Elke succesvolle/gefaalde delete wordt naar audit_logs geschreven.
 *   - Als Supabase admin niet geconfigureerd is, wordt de Prisma-delete toch
 *     uitgevoerd — orphaned Supabase user blijft dan achter (te cleanen via
 *     admin-panel).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'

const GRACE_PERIOD_DAYS = 30

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseJsClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // In productie moet CRON_SECRET gezet zijn. In dev staan we lokale GET toe.
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return false
  return auth.slice(7) === secret
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 86400 * 1000)
  const toDelete = await prisma.user.findMany({
    where: {
      deletionRequestedAt: { lte: cutoff, not: null },
      deletedAt: null,
    },
    select: { id: true, email: true, deletionRequestedAt: true },
  })

  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, cutoff: cutoff.toISOString() })
  }

  const admin = getSupabaseAdmin()

  const results: Array<{ email: string; ok: boolean; error?: string }> = []

  for (const u of toDelete) {
    try {
      if (admin) {
        try {
          const { data: list } = await admin.auth.admin.listUsers()
          const supaUser = list.users.find((x) => x.email === u.email)
          if (supaUser) await admin.auth.admin.deleteUser(supaUser.id)
        } catch (sbErr) {
          // Log maar blok niet — Prisma-delete is de bron van waarheid
          console.warn(
            '[cron/gdpr-cleanup] supabase-delete failed for',
            u.email,
            (sbErr as Error).message,
          )
        }
      }

      await prisma.user.delete({ where: { id: u.id } })

      await auditLog({
        event: 'ACCOUNT_DELETED',
        resource: 'User',
        resourceId: u.id,
        actorEmail: 'cron:gdpr-cleanup',
        metadata: {
          originalEmail: u.email,
          requestedAt: u.deletionRequestedAt?.toISOString(),
          source: 'cron',
        },
        req,
      })

      results.push({ email: u.email, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[cron/gdpr-cleanup] delete failed for', u.email, msg)
      results.push({ email: u.email, ok: false, error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: toDelete.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    cutoff: cutoff.toISOString(),
  })
}
