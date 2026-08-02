/**
 * Herstelmelding op het moment dat de wearable-data binnenkomt.
 *
 * De ochtend-cron (`/api/cron/daily-reminders`, 07:00 NL) leest de readiness
 * die om 05:00 NL is berekend. Een Apple Watch levert zijn nacht pas aan als de
 * gebruiker de app opent, in de praktijk tussen 07:00 en 09:40. Om 05:00 staat
 * er dan nog niets van vannacht in de database, en `computeReadiness` scoort de
 * laatst beschikbare nacht (zie de kop van src/lib/readiness.ts) — dus op de
 * data van gisteren. Wie 's ochtends synchroniseert kreeg daardoor structureel
 * geen herstelmelding meer: de band was om 05:00 nog neutraal en werd pas na de
 * ochtendsync duidelijk, ruim nadat de cron zijn moment had gehad.
 *
 * Deze module hangt de melding daarom aan het binnenkomen van de data in plaats
 * van aan de klok. De cron blijft ongemoeid en houdt de trainingsherinnering,
 * de belastingwaarschuwing, en de herstelmelding voor wie 's nachts al gesynct
 * heeft. De twee paden sluiten elkaar uit via dezelfde "maximaal één insight
 * per dag"-regel die de cron al hanteerde.
 */
import type { PrismaClient } from '@prisma/client'
import { dateKey, amsMidnight } from '@/lib/week-dates'
import { uitbehandeldDoorIedereen } from '@/server/lib/care-scope'
import { notifyRecovery } from './notify'
import { MORNING_PUSH_HOUR } from './timing'

export type MorningInsightDb = Pick<
  PrismaClient,
  'readinessSnapshot' | 'notification' | 'patientCareStatus' | 'patientTherapist'
>

/**
 * Na dit uur (NL) sturen we geen herstelmelding meer. "Een prima dag om iets
 * steviger te trainen" is 's middags geen advies meer, en wie zijn app pas
 * 's avonds opent hoort daar niet alsnog een melding over te krijgen.
 */
export const INSIGHT_WINDOW_END_HOUR = 12

export type Uitkomst =
  | 'sent'
  | 'niet-vandaag'
  | 'buiten-venster'
  | 'al-verstuurd'
  | 'uitbehandeld'
  | 'geen-signaal'
  | 'fout'

function amsUurVan(now: Date): number {
  const uur = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find(p => p.type === 'hour')?.value
  return Number(uur ?? '0')
}

/**
 * Ondergrens die tijdens het ochtendvenster exact de snapshot van vandaag
 * aanwijst.
 *
 * `computeAndStoreReadiness` ankert op `startOfDay()`, en dat is
 * `setHours(0,0,0,0)` in de tijdzone van de server. Op Vercel is dat UTC, dus
 * de snapshots staan op UTC-middernacht en NIET op `amsMidnight` zoals de rest
 * van de weekplanning (zie AGENTS.md). Hier rekenen we die grens daarom
 * expliciet in UTC uit in plaats van `startOfDay` te hergebruiken: dat laatste
 * zou in een test op een niet-UTC machine een andere dag aanwijzen.
 *
 * Binnen het venster (07:00-12:00 NL = 05:00-10:00 UTC) valt de UTC-kalenderdag
 * altijd samen met de Amsterdamse, dus deze ondergrens laat precies de rij van
 * vandaag door. Bestaat die niet — een LEARNING-dag wordt bewust niet
 * opgeslagen — dan levert de query niets op in plaats van stilletjes die van
 * gisteren, en zwijgen we.
 */
function ondergrensSnapshotVandaag(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Zit dit moment in het venster waarin een herstelmelding nog zinvol is? */
export function binnenOchtendVenster(now: Date): boolean {
  const uur = amsUurVan(now)
  // Vóór MORNING_PUSH_HOUR bewust niets: daar is de cron nog van. Zou deze
  // module daar ook pushen, dan onderdrukt `sendPush` hem op quiet hours en
  // schrijft alsnog een in-app regel, waarna de cron om 07:00 een tweede
  // schrijft. Eén afzender per moment houdt dat schoon.
  return uur >= MORNING_PUSH_HOUR && uur < INSIGHT_WINDOW_END_HOUR
}

/** Zat de dag van vandaag (NL) in deze sync? Een backfill telt dus niet. */
export function raaktVandaag(affectedDates: Date[], now: Date): boolean {
  const vandaag = dateKey(now)
  return affectedDates.some(d => dateKey(d) === vandaag)
}

/**
 * Stuur de herstelmelding als deze sync verse data van vandaag bracht en de
 * band een duidelijk signaal geeft. Gooit nooit: een mislukte melding mag een
 * sync niet laten klappen.
 */
export async function maybeNotifyRecoveryOnSync(
  db: MorningInsightDb,
  userId: string,
  affectedDates: Date[],
  now: Date = new Date(),
): Promise<Uitkomst> {
  try {
    if (!raaktVandaag(affectedDates, now)) return 'niet-vandaag'
    if (!binnenOchtendVenster(now)) return 'buiten-venster'

    // Idempotentie, exact de regel van de cron: rijen met `pushed === false`
    // (onderdrukt door quiet hours of uitgezette voorkeuren) tellen niet mee,
    // legacy-rijen zonder de vlag wél.
    const insightsVandaag = await db.notification.findMany({
      where: { userId, type: 'push.insight', createdAt: { gte: amsMidnight(dateKey(now)) } },
      select: { data: true },
    })
    const alGepusht = insightsVandaag.some(
      n => (n.data as { pushed?: boolean } | null)?.pushed !== false,
    )
    if (alGepusht) return 'al-verstuurd'

    // Wie door iedereen is uitbehandeld krijgt geen ochtendsignaal meer. Zelfde
    // afweging als in de cron: één markering is niet genoeg, want iemand kan in
    // twee scopes zitten. `reactivatedAt: null` omdat rijen als historie blijven.
    const markeringen = await db.patientCareStatus.findMany({
      where: { patientId: userId, reactivatedAt: null },
      select: { practiceId: true, coachId: true },
    })
    if (markeringen.length > 0) {
      const relaties = await db.patientTherapist.findMany({
        where: { patientId: userId, isActive: true, status: 'APPROVED' },
        select: { therapist: { select: { id: true, role: true, practiceId: true } } },
      })
      if (uitbehandeldDoorIedereen(relaties.map(r => r.therapist), markeringen)) {
        return 'uitbehandeld'
      }
    }

    const snapshot = await db.readinessSnapshot.findFirst({
      where: { userId, date: { gte: ondergrensSnapshotVandaag(now) } },
      orderBy: { date: 'desc' },
      select: { band: true },
    })
    if (snapshot?.band === 'GREEN') {
      await notifyRecovery(userId, 'good')
      return 'sent'
    }
    if (snapshot?.band === 'RED') {
      await notifyRecovery(userId, 'low')
      return 'sent'
    }
    return 'geen-signaal'
  } catch (err) {
    console.error('[push] herstelmelding bij sync faalde', { userId, err })
    return 'fout'
  }
}
