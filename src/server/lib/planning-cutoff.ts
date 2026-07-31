import type { PrismaClient } from '@prisma/client'
import { planningCutoff } from '@/lib/care-cutoff'
import { uitbehandeldDoorIedereen } from './care-scope'

/**
 * Vanaf welke week ziet DEZE patiënt geen planning meer? `null` = alles tonen.
 *
 * Voor de patiëntkant (calendarRange, mySchedule, myWeekMeta). Er is hier geen
 * ingelogde therapeut en dus geen scope om op te filteren, precies zoals in de
 * cron-jobs. "Eén markering, waar dan ook" is daarom het VERKEERDE antwoord:
 * één persoon kan in twee scopes zitten (patients.inviteCoMonitor koppelt de
 * atleet van een coach aan een praktijk-therapeut). Archiveert de coach terwijl
 * de praktijk-therapeut doorplant, dan zou de patiënt de weken van die
 * therapeut kwijtraken terwijl ze gewoon in de planner staan. Vandaar dezelfde
 * vraag als in insights/compute.ts en de daily-reminders-cron:
 * `uitbehandeldDoorIedereen`.
 *
 * Nul actieve behandelaars telt niet als uitbehandeld. Die regel zit in
 * `uitbehandeldDoorIedereen` zelf en beschermt de shop-koper zonder koppeling.
 *
 * `reactivatedAt: null` hoort er expliciet bij: rijen blijven als historie
 * staan, dus zonder die voorwaarde zou één ooit afgesloten periode de planning
 * voor altijd afknippen.
 */
export async function planningCutoffVoorPatient(
  prisma: PrismaClient,
  patientId: string,
): Promise<Date | null> {
  const markeringen = await prisma.patientCareStatus.findMany({
    where: { patientId, reactivatedAt: null },
    select: { practiceId: true, coachId: true, dischargedAt: true },
  })
  // Verreweg de meeste patiënten komen hier weg met één indexed query; de
  // relatie-query hieronder draait alleen voor wie echt een markering heeft.
  if (markeringen.length === 0) return null

  const relaties = await prisma.patientTherapist.findMany({
    where: { patientId, isActive: true, status: 'APPROVED' },
    select: { therapist: { select: { id: true, role: true, practiceId: true } } },
  })
  if (!uitbehandeldDoorIedereen(relaties.map((r) => r.therapist), markeringen)) {
    return null
  }

  // De LAATSTE afsluiting bepaalt de knip. Sloot de coach in januari af en de
  // therapeut pas in augustus, dan is de patiënt pas in augustus door iedereen
  // uitbehandeld en hoort alles daarvóór zichtbaar te blijven.
  const laatste = markeringen.reduce(
    (a, b) => (b.dischargedAt > a ? b.dischargedAt : a),
    markeringen[0].dischargedAt,
  )
  return planningCutoff(laatste)
}
