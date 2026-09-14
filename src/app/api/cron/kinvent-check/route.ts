/**
 * Nachtelijke controle van de Kinvent-koppeling.
 *
 * Importeert niets: een import blijft een voorstel dat de therapeut
 * bevestigt. Wat dit wél doet, per praktijk met een geldige aanmelding:
 *
 *   1. Per gekoppelde patiënt bij Kinvent kijken of er metingen zijn die nog
 *      niet in BASE staan, en dat aantal op de patiëntpagina zetten.
 *   2. Waarschuwen als de aanmelding bijna verloopt (mail aan degene die
 *      aanmeldde), één keer per token.
 *
 * Setup: vercel.json registreert dit pad; CRON_SECRET moet matchen.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeCron } from '@/server/lib/cron-auth'
import { KinventError, fetchProtocolsForParticipant } from '@/lib/kinvent/client'
import { decryptToken } from '@/lib/kinvent/crypto'
import { countPending } from '@/lib/kinvent/catalog-match'
import { escapeHtml, sendMail } from '@/server/mail'

const WARN_DAYS = 5

async function waarschuwVerloop(conn: { id: string; connectedById: string; tokenExpiresAt: Date }, daysLeft: number) {
  const wie = await prisma.user.findUnique({ where: { id: conn.connectedById }, select: { email: true, name: true } })
  if (!wie?.email) return
  const dag = daysLeft === 1 ? '1 dag' : `${daysLeft} dagen`
  const tot = conn.tokenExpiresAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
  await sendMail({
    to: wie.email,
    subject: `De Kinvent-aanmelding van de praktijk verloopt over ${dag}`,
    text:
      `De aanmelding van de praktijk bij Kinvent is geldig tot ${tot}. ` +
      'Meld opnieuw aan op de patiëntpagina onder Tests, anders stopt het ophalen van metingen.',
    html:
      `<p>De aanmelding van de praktijk bij Kinvent is geldig tot ${escapeHtml(tot)}.</p>` +
      '<p>Meld opnieuw aan op de patiëntpagina onder Tests, anders stopt het ophalen van metingen.</p>',
  })
  await prisma.kinventConnection.update({ where: { id: conn.id }, data: { renewalWarnedAt: new Date() } })
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req, { allowDevFallback: true })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const startedAt = Date.now()
  const now = new Date()
  let practices = 0
  let patients = 0
  let failed = 0
  let warned = 0
  let expired = 0
  try {
    const connections = await prisma.kinventConnection.findMany()
    for (const conn of connections) {
      const daysLeft = Math.ceil((conn.tokenExpiresAt.getTime() - now.getTime()) / 86_400_000)
      if (daysLeft <= WARN_DAYS && !conn.renewalWarnedAt) {
        try {
          await waarschuwVerloop(conn, Math.max(daysLeft, 0))
          warned++
        } catch (err) {
          console.error('[cron/kinvent-check] waarschuwing mislukt', conn.practiceId, err)
        }
      }
      if (conn.tokenExpiresAt <= now) {
        expired++
        continue
      }
      practices++
      const token = decryptToken(conn.token)
      const gekoppeld = await prisma.user.findMany({
        where: { practiceId: conn.practiceId, kinventParticipantCode: { not: null } },
        select: { id: true, kinventParticipantCode: true },
      })
      for (const p of gekoppeld) {
        if (!p.kinventParticipantCode) continue
        try {
          const protocols = await fetchProtocolsForParticipant(token, p.kinventParticipantCode)
          const [entries, jumps] = await Promise.all([
            prisma.testReportEntry.findMany({
              where: { report: { patientId: p.id }, kinventProtocolCode: { not: null } },
              select: { kinventProtocolCode: true },
            }),
            prisma.kinventJumpResult.findMany({ where: { patientId: p.id }, select: { protocolCode: true } }),
          ])
          const known = new Set<string>([
            ...entries.flatMap((e) => (e.kinventProtocolCode ? [e.kinventProtocolCode] : [])),
            ...jumps.map((j) => j.protocolCode),
          ])
          const pending = countPending(protocols, known)
          await prisma.kinventSync.upsert({
            where: { patientId: p.id },
            create: { patientId: p.id, pendingCount: pending, lastCheckedAt: now },
            update: { pendingCount: pending, lastCheckedAt: now, lastError: null },
          })
          patients++
        } catch (err) {
          failed++
          const message = err instanceof Error ? err.message : String(err)
          await prisma.kinventSync.upsert({
            where: { patientId: p.id },
            create: { patientId: p.id, lastError: message },
            update: { lastError: message },
          })
          if (err instanceof KinventError && err.needsSignIn) {
            // Token afgekeurd bij Kinvent: de rest van deze praktijk heeft geen zin.
            await prisma.kinventConnection.update({ where: { id: conn.id }, data: { lastError: message } })
            console.info('[cron/kinvent-check] token afgekeurd, praktijk overgeslagen', conn.practiceId)
            break
          }
          console.error('[cron/kinvent-check] patiënt mislukt', p.id, err)
        }
      }
    }
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - startedAt, practices, patients, failed, warned, expired })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/kinvent-check] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
