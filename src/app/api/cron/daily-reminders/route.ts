/**
 * Cron: dagelijkse ochtend-pushes (09:00 Amsterdam) naar iedereen met de app,
 * ongeacht rol — de signalen gaan altijd over de eigen data van de ontvanger,
 * dus een therapeut die zelf traint krijgt ze net zo goed als een patiënt.
 *
 * Per ontvanger maximaal:
 *   - REMINDER: "je training van vandaag" als er vandaag een PROGRAM/WORKOUT-item
 *     op de week-planner staat.
 *   - INSIGHT (max één): het herstel-signaal uit de readiness-band van vandaag
 *     (GREEN → goed hersteld, RED → wat lager); is die neutraal (AMBER/LEARNING)
 *     maar staat er een verse overload_risk-insight, dan de belasting-waarschuwing.
 *
 * DST-veilig: vercel.json draait dit op 07:00 én 08:00 UTC; de guard hieronder
 * laat alléén het uur dat in Amsterdam 09:00 is echt door (zomer 07:00 UTC,
 * winter 08:00 UTC). Idempotent per dag via de al-verstuurde notificaties.
 *
 * Load lift bewust op deze 09:00-cron mee (niet op compute-insights om 06:00 UTC):
 * dat zou 's winters vóór 08:00 lokaal vallen en door de quiet-hours-default van
 * niet-urgente pushes gedropt worden.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeCron } from '@/server/lib/cron-auth'
import { dateKey, mondayKeyOf, addDaysKey, amsMidnight } from '@/lib/week-dates'
import {
  notifyTrainingToday,
  notifyRecovery,
  notifyLoadWarning,
} from '@/server/push/notify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const REMINDER_HOUR = 9

function amsHourOf(now: Date): number {
  const part = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value
  return Number(part ?? '0')
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req, { allowDevFallback: true })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // Alleen op het uur dat in Amsterdam 09:00 is. `?force=1` overslaat dit voor
  // handmatig testen (in prod alleen bereikbaar mét geldig CRON_SECRET).
  const force = req.nextUrl.searchParams.get('force') === '1'
  if (!force && amsHourOf(now) !== REMINDER_HOUR) {
    return NextResponse.json({ ok: true, skipped: 'buiten venster (09:00 Amsterdam)' })
  }

  const startedAt = Date.now()
  try {
    // Dagankers in Amsterdam-tijd.
    const todayKey = dateKey(now)
    const mondayKey = mondayKeyOf(now)
    const weekMonday = amsMidnight(mondayKey)
    const nextMonday = amsMidnight(addDaysKey(mondayKey, 7))
    const todayMidnight = amsMidnight(todayKey)
    const yesterdayMidnight = amsMidnight(addDaysKey(todayKey, -1))
    const todayDow = Math.round((todayMidnight.getTime() - weekMonday.getTime()) / 86_400_000)

    // Kandidaten: iedereen met minstens één geregistreerd device, ongeacht rol.
    //
    // Bewust géén rolfilter: alle drie de signalen hieronder kijken naar de
    // EIGEN data van de ontvanger (eigen weekschema, eigen readiness, eigen
    // insight), dus een therapeut die zelf traint (zie therapist personal mode)
    // hoort ze net zo goed te krijgen als een patiënt. Met de oude filter op
    // PATIENT/ATHLETE kreeg een therapeut of admin nooit iets, ook niet over de
    // eigen training. Wie niets in de eigen agenda heeft staan en geen wearable
    // draagt, krijgt vanzelf nog steeds niets — de queries leveren dan leeg op.
    const tokenRows = await prisma.pushToken.findMany({
      select: { userId: true },
      distinct: ['userId'],
    })
    const tokenUserIds = tokenRows.map((t) => t.userId)
    if (tokenUserIds.length === 0) {
      return NextResponse.json({ ok: true, candidates: 0, sent: 0 })
    }
    // Via `user` (niet rechtstreeks de token-ids) zodat de soft-delete-extension
    // verwijderde accounts eruit filtert.
    const recipients = await prisma.user.findMany({
      where: { id: { in: tokenUserIds } },
      select: { id: true },
    })
    const recipientIds = recipients.map((p) => p.id)
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: true, candidates: 0, sent: 0 })
    }

    // Idempotentie: wat is er vandaag al ÉCHT gepusht (per categorie-type)?
    // Rijen met `data.pushed === false` (bv. onderdrukt door quiet hours)
    // tellen niet mee — anders blokkeert een stille 07:00-rij de 09:00-push.
    // Legacy-rijen zonder vlag tellen wél mee (die waren vermoedelijk gepusht).
    const sentToday = await prisma.notification.findMany({
      where: {
        userId: { in: recipientIds },
        createdAt: { gte: todayMidnight },
        type: { in: ['push.reminder', 'push.insight'] },
      },
      select: { userId: true, type: true, data: true },
    })
    const delivered = sentToday.filter(
      (n) => (n.data as { pushed?: boolean } | null)?.pushed !== false,
    )
    const alreadyReminder = new Set(
      delivered.filter((n) => n.type === 'push.reminder').map((n) => n.userId),
    )
    const alreadyInsight = new Set(
      delivered.filter((n) => n.type === 'push.insight').map((n) => n.userId),
    )

    // 1. Wie heeft vandaag training op de week-planner staan?
    const trainingDays = await prisma.weekScheduleDay.findMany({
      where: {
        dayOfWeek: todayDow,
        items: { some: { kind: { in: ['PROGRAM', 'WORKOUT'] } } },
        weekSchedule: {
          isTemplate: false,
          patientId: { in: recipientIds },
          startDate: { gte: weekMonday, lt: nextMonday },
        },
      },
      select: { weekSchedule: { select: { patientId: true } } },
    })
    const trainingToday = new Set(
      trainingDays.map((d) => d.weekSchedule.patientId).filter((id): id is string => id != null),
    )

    // 2. Herstel-band van vandaag (nieuwste snapshot per user).
    const snapshots = await prisma.readinessSnapshot.findMany({
      where: { userId: { in: recipientIds }, date: { gte: yesterdayMidnight } },
      orderBy: { date: 'desc' },
      select: { userId: true, band: true },
    })
    const bandByUser = new Map<string, string>()
    for (const s of snapshots) {
      if (!bandByUser.has(s.userId)) bandByUser.set(s.userId, s.band)
    }

    // 3. Verse overload_risk-insights van vandaag.
    const loadInsights = await prisma.insight.findMany({
      where: {
        patientId: { in: recipientIds },
        signalType: 'overload_risk',
        status: 'OPEN',
        createdAt: { gte: todayMidnight },
      },
      select: { patientId: true },
    })
    const overloadToday = new Set(loadInsights.map((i) => i.patientId))

    let trainingSent = 0
    let recoverySent = 0
    let loadSent = 0

    for (const id of recipientIds) {
      // Training-reminder.
      if (trainingToday.has(id) && !alreadyReminder.has(id)) {
        await notifyTrainingToday(id)
        trainingSent++
      }

      // Eén insight-push: herstel heeft voorrang, anders belasting.
      if (!alreadyInsight.has(id)) {
        const band = bandByUser.get(id)
        if (band === 'GREEN') {
          await notifyRecovery(id, 'good')
          recoverySent++
        } else if (band === 'RED') {
          await notifyRecovery(id, 'low')
          recoverySent++
        } else if (overloadToday.has(id)) {
          await notifyLoadWarning(id)
          loadSent++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      candidates: recipientIds.length,
      trainingSent,
      recoverySent,
      loadSent,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/daily-reminders] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
