/**
 * Doorwerking van testrapport-metingen naar protocol-criteria.
 *
 * Aangeroepen na elke opslag van een rapport-entry (testReports.updateEntry).
 * Eén keer meten: het rapport toont de meting, en het gekoppelde criterium in
 * het lopende traject kleurt automatisch mee. Nieuwste meting wint; een oudere
 * meting overschrijft nooit een recentere status (ook geen handmatige).
 *
 * Bewust fire-and-forget vanaf de call-site (fouten falen de opslag niet): de
 * meting zelf is dan al opgeslagen en dat is de primaire handeling.
 */
import type { PrismaClient } from '@prisma/client'

import { findOpenTracker } from '@/lib/rehab-data'
import { bepaalCriteriumStatus } from '@/lib/rehab-criterion-status'
import type { TestSpec, TestValues } from '@/lib/test-report/compute'
import { notifyRehabCriterion, notifyRehabPhase } from '@/server/push/notify'

type CriterionRef = { id: string; phaseId: string; phase: { protocolId: string; order: number } }

/**
 * Melding aan de patiënt bij een echte overgang naar MET, plus de
 * fase-compleet-melding. Gedeeld met rehab.updateCriterionStatus zodat de
 * handmatige en de automatische route exact dezelfde meldingen sturen.
 * Telt op trackerId, nooit op patientId: anders tellen vinkjes uit een
 * afgesloten traject mee en krijgt de patiënt een onterechte fase-melding.
 */
export async function meldMetOvergang(
  prisma: PrismaClient,
  patientId: string,
  trackerId: string,
  criterion: CriterionRef,
): Promise<void> {
  await notifyRehabCriterion(patientId).catch(() => {})

  const phaseCriteria = await prisma.rehabCriterion.findMany({
    where: { phaseId: criterion.phaseId },
    select: { id: true },
  })
  const metCount = await prisma.rehabCriterionStatus.count({
    where: {
      trackerId,
      criterionId: { in: phaseCriteria.map((c) => c.id) },
      status: 'MET',
    },
  })
  if (phaseCriteria.length > 0 && metCount === phaseCriteria.length) {
    const nextPhase = await prisma.rehabPhase.findFirst({
      where: { protocolId: criterion.phase.protocolId, order: { gt: criterion.phase.order } },
      select: { id: true },
    })
    if (nextPhase) await notifyRehabPhase(patientId).catch(() => {})
  }
}

export async function syncCriteriaVoorEntry(
  prisma: PrismaClient,
  entryId: string,
  therapistId: string,
): Promise<void> {
  const entry = await prisma.testReportEntry.findUnique({
    where: { id: entryId },
    include: { report: { select: { patientId: true, performedAt: true } } },
  })
  if (!entry || !entry.catalogItemId) return

  const tracker = await findOpenTracker(prisma, entry.report.patientId)
  if (!tracker) return

  // Alleen criteria uit het protocol van het lopende traject: een criterium met
  // dezelfde catalogus-test in een ander protocol gaat deze patiënt niet aan.
  const criteria = await prisma.rehabCriterion.findMany({
    where: { catalogItemId: entry.catalogItemId, phase: { protocolId: tracker.protocolId } },
    include: { phase: { select: { protocolId: true, order: true } } },
  })
  if (criteria.length === 0) return

  const spec: TestSpec = {
    kind: entry.kind as TestSpec['kind'],
    metric: entry.metric as TestSpec['metric'],
    plotUnit: entry.plotUnit,
    axisMin: entry.axisMin,
    axisMax: entry.axisMax,
    zoneOrangeMin: entry.zoneOrangeMin,
    zoneGreenMin: entry.zoneGreenMin,
    higherIsBetter: entry.higherIsBetter,
  }
  const values: TestValues = {
    leftPrimary: entry.leftPrimary,
    rightPrimary: entry.rightPrimary,
    singleValue: entry.singleValue,
    plottedValueOverride: entry.plottedValueOverride,
    zoneOverride: entry.zoneOverride as TestValues['zoneOverride'],
  }

  for (const criterion of criteria) {
    const uitkomst = bepaalCriteriumStatus(criterion, spec, values)
    if (!uitkomst) continue

    // Nieuwste meting wint. measurementDate is bij handmatige statussen vaak
    // leeg; dan telt updatedAt, zodat een handmatige registratie van vandaag
    // niet door een rapport van vorige week wordt teruggedraaid.
    const bestaand = await prisma.rehabCriterionStatus.findUnique({
      where: { trackerId_criterionId: { trackerId: tracker.id, criterionId: criterion.id } },
      select: { status: true, measurementDate: true, updatedAt: true },
    })
    const bestaandeDatum = bestaand?.measurementDate ?? bestaand?.updatedAt ?? null
    if (bestaandeDatum && entry.report.performedAt < bestaandeDatum) continue

    await prisma.rehabCriterionStatus.upsert({
      where: { trackerId_criterionId: { trackerId: tracker.id, criterionId: criterion.id } },
      update: {
        status: uitkomst.status,
        measurementValue: uitkomst.samenvatting,
        measurementDate: entry.report.performedAt,
        reportEntryId: entry.id,
        updatedById: therapistId,
      },
      create: {
        trackerId: tracker.id,
        criterionId: criterion.id,
        status: uitkomst.status,
        measurementValue: uitkomst.samenvatting,
        measurementDate: entry.report.performedAt,
        reportEntryId: entry.id,
        updatedById: therapistId,
      },
    })

    if (uitkomst.status === 'MET' && bestaand?.status !== 'MET') {
      await meldMetOvergang(prisma, entry.report.patientId, tracker.id, criterion)
    }
  }
}
