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
import { authorizeCron } from '@/server/lib/cron-auth'

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

export async function GET(req: NextRequest) {
  // Deze route verwijdert accounts PERMANENT — fail closed: geen dev-fallback,
  // zonder CRON_SECRET nooit autoriseren (ook niet in dev/preview).
  if (!authorizeCron(req)) {
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
      // De verwijdering is hier definitief mislukt en de gebruiker blijft dus
      // staan met een lopend AVG-verzoek. Het antwoord van deze route ziet
      // niemand (cron), dus dit logregel is het enige spoor: prefix + id +
      // reden, zodat je er in Vercel op kunt zoeken.
      //
      // Meest voorkomende oorzaak is een RESTRICT-foreign-key op auteurschap
      // (programma's, oefeningen, care-status, rehab). scripts/delete-user.ts
      // zet die relaties eerst over naar de admin en ruimt zo'n blijver op.
      console.error(
        '[cron/gdpr-cleanup] delete failed',
        JSON.stringify({ userId: u.id, email: u.email, reason: msg }),
      )
      // Naast de logregel ook in de audit-trail, want dáár kijkt een mens wel.
      // Een mislukte verwijdering is geen technisch detail: er loopt een
      // AVG-termijn door terwijl de gebruiker blijft staan. Zonder dit spoor
      // moet iemand op goed geluk in de Vercel-logs zoeken naar een fout
      // waarvan hij niet weet dat hij bestaat.
      await auditLog({
        event: 'ACCOUNT_DELETE_FAILED',
        resource: 'User',
        resourceId: u.id,
        actorEmail: 'cron:gdpr-cleanup',
        metadata: {
          originalEmail: u.email,
          requestedAt: u.deletionRequestedAt?.toISOString(),
          reason: msg,
          source: 'cron',
          // Wat je moet doen. De meest voorkomende oorzaak is een
          // RESTRICT-relatie op auteurschap; dat script zet die eerst over.
          remedie: 'EMAIL=<adres> PREVIEW=1 npx tsx scripts/delete-user.ts',
        },
        req,
      }).catch(() => {
        // Faalt de audit-schrijf ook, dan blijft de console-regel hierboven
        // over. Nooit de lus laten omvallen op het opschrijven van een fout.
      })
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
