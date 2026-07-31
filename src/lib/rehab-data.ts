import type { PrismaClient } from '@prisma/client'

import { mergeCriterionStatuses, statussenVanTraject } from './rehab-traject'

/**
 * Rehab-tracker data — geconsolideerd voor:
 *  - `rehab.getPatientTracker` / `rehab.getMyTracker` tRPC procedures
 *  - PDF-export (`/print/progress/[patientId]` + `patients.getProgressPdfHtml`)
 *
 * Pure: geen access-checks, geen audit-log. Caller handelt dat af.
 */

function weeksBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 3600 * 1000))
}

export type PatientRehabTrackerData = NonNullable<
  Awaited<ReturnType<typeof getPatientRehabTrackerData>>
>

/**
 * Genoeg client om trajecten te lezen en te schrijven: alleen de
 * tracker-delegate, niet de hele `PrismaClient`.
 *
 * Zo kan een caller ook de transactie-client uit `$transaction(async (tx) =>
 * ...)` doorgeven. Die mist `$transaction` en `$connect` en is dus geen
 * `PrismaClient`, terwijl hij deze query prima kan uitvoeren.
 * `patients.setInactive` heeft dat nodig om het lopende traject in dezelfde
 * transactie te sluiten als de uitbehandel-markering.
 */
export type TrackerClient = Pick<PrismaClient, 'patientRehabTracker'>

/**
 * Het lopende traject van een patiënt, of null als er geen loopt.
 *
 * DE enige plek waar "welk traject loopt er" wordt beslist. Er stonden vier
 * kopieën van deze query verspreid over de router en deze module, waarvan er
 * één geen `orderBy` had; die konden bij historie uit elkaar gaan lopen. Wie
 * een harde fout wil in plaats van null, gebruikt `openTrackerFor` in
 * `src/server/routers/rehab.ts`.
 *
 * Met historie kan er meer dan één rij per patiënt zijn. De partiële unique
 * index houdt het aantal open trajecten op één, maar vertrouw daar niet op:
 * een expliciete volgorde maakt dit deterministisch. `id` als tweede sleutel,
 * want bij een gelijke activatedAt is de keuze anders alsnog willekeurig.
 */
export async function findOpenTracker(prisma: TrackerClient, patientId: string) {
  return prisma.patientRehabTracker.findFirst({
    where: { patientId, deactivatedAt: null },
    orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
  })
}

/**
 * Het lopende traject van een patiënt.
 *
 * Dunne wrapper: zoekt het open traject op en laat `getRehabTrackerDataById`
 * de rest doen. Naam, argumenten en returnvorm zijn ONGEWIJZIGD, want de
 * PDF-routes (`/print/progress/[patientId]`, `patients.getProgressPdfHtml`)
 * en de iOS-app leunen erop.
 */
export async function getPatientRehabTrackerData(
  prisma: PrismaClient,
  patientId: string,
) {
  const open = await findOpenTracker(prisma, patientId)
  if (!open) return null
  return getRehabTrackerDataById(prisma, open.id)
}

/**
 * Eén traject op zijn eigen id, open of afgesloten. Hiermee kan een
 * historie-scherm (`rehab.getTraject`) een afgesloten episode teruglezen in
 * exact dezelfde vorm als het lopende traject.
 *
 * Geen access-check: de caller autoriseert op de `patientId` van de gevonden
 * rij, nooit op een meegestuurde patientId.
 */
export async function getRehabTrackerDataById(
  prisma: PrismaClient,
  trackerId: string,
) {
  const tracker = await prisma.patientRehabTracker.findUnique({
    where: { id: trackerId },
    include: {
      protocol: {
        include: {
          phases: {
            orderBy: { order: 'asc' },
            include: { criteria: { orderBy: { order: 'asc' } } },
          },
        },
      },
      activatedBy: { select: { id: true, name: true, email: true } },
    },
  })

  if (!tracker) return null

  const criterionIds = tracker.protocol.phases.flatMap((p) =>
    p.criteria.map((c) => c.id),
  )
  // Op trackerId, niet op patientId: anders lekken de vinkjes van een
  // afgesloten traject door in het nieuwe protocol. De unique index op
  // ("trackerId","criterionId") garandeert al hoogstens één rij per criterium.
  // De grens op criterionIds staat er weer bij omdat de tellingen hieronder
  // erop leunen: zonder die grens kunnen `met` en `inProgress` op topniveau
  // hoger uitvallen dan `total`.
  const ruweStatussen = await prisma.rehabCriterionStatus.findMany({
    where: { trackerId: tracker.id, criterionId: { in: criterionIds } },
  })
  // Tweede slot op dezelfde deur, en het enige dat zonder database te testen
  // is. Zie src/lib/rehab-traject.ts.
  const statuses = statussenVanTraject(ruweStatussen, tracker.id, criterionIds)
  const statusByCriterionId = new Map(statuses.map((s) => [s.criterionId, s]))

  const now = new Date()
  let weeksSinceSurgery: number | null = null
  let expectedPhaseOrder: number | null = null
  if (tracker.surgeryDate) {
    weeksSinceSurgery = weeksBetween(tracker.surgeryDate, now)
    for (const phase of tracker.protocol.phases) {
      if (phase.typicalStartWeek == null) continue
      if (weeksSinceSurgery < phase.typicalStartWeek) continue
      if (phase.typicalEndWeek == null || weeksSinceSurgery < phase.typicalEndWeek) {
        expectedPhaseOrder = phase.order
        break
      }
    }
    if (weeksSinceSurgery < 0) {
      const preOp = tracker.protocol.phases.find((p) => p.order === 0)
      if (preOp) expectedPhaseOrder = preOp.order
    }
  }

  const total = criterionIds.length
  const met = statuses.filter((s) => s.status === 'MET').length
  const inProgress = statuses.filter((s) => s.status === 'IN_PROGRESS').length
  const progressPct = total > 0 ? Math.round((met / total) * 100) : 0

  return {
    // Additief: `closeTraject`/`reopenTraject` en de web-UI moeten een traject
    // kunnen aanwijzen. Bestaande clients negeren onbekende velden, dus build 78
    // merkt hier niets van.
    trackerId: tracker.id,
    // Van de rij zelf, niet uit een argument: deze functie kent alleen een
    // trackerId.
    patientId: tracker.patientId,
    protocolId: tracker.protocolId,
    protocol: {
      id: tracker.protocol.id,
      key: tracker.protocol.key,
      name: tracker.protocol.name,
      description: tracker.protocol.description,
      sourceReference: tracker.protocol.sourceReference,
    },
    surgeryDate: tracker.surgeryDate,
    injuryDate: tracker.injuryDate,
    activatedAt: tracker.activatedAt,
    // Additief, net als `trackerId`: `rehab.getTraject` leest ook AFGESLOTEN
    // trajecten en moet zelf kunnen zien dat het er een uit de historie is.
    // Voor het lopende traject zijn deze twee altijd null, dus de bestaande
    // clients zien niets veranderen.
    //
    // `outcomeNote` staat hier BEWUST NIET bij. Deze vorm voedt ook
    // `rehab.getMyTracker`, en dat is patiënt-facing: de toelichting bij een
    // afsluiting is klinische vrije tekst van de therapeut en hoort niet op het
    // toestel van de patiënt. Dat hij vandaag alleen samen met `deactivatedAt`
    // gezet wordt is een code-invariant, geen afdwinging. Wie de toelichting
    // nodig heeft, leest hem in `rehab.getTraject` of `rehab.listTrajects`;
    // die draaien allebei op therapistProcedure. Niet terugzetten.
    deactivatedAt: tracker.deactivatedAt,
    outcome: tracker.outcome,
    activatedByName: tracker.activatedBy.name ?? tracker.activatedBy.email,
    notes: tracker.notes,
    weeksSinceSurgery,
    expectedPhaseOrder,
    progress: { total, met, inProgress, pct: progressPct },
    phases: tracker.protocol.phases.map((phase) => {
      // Expliciete projectie i.p.v. de ruwe Prisma-rij spreaden: `criteria`
      // hieronder mag alleen deze velden bevatten, niet elk kolomveld dat
      // Prisma toevallig meegeeft.
      const criteriaBase = phase.criteria.map((c) => ({
        id: c.id,
        order: c.order,
        name: c.name,
        testDescription: c.testDescription,
        reference: c.reference,
        targetValue: c.targetValue,
        targetUnit: c.targetUnit,
        inputType: c.inputType,
        isBonus: c.isBonus,
        isBilateral: c.isBilateral,
        newtonMinGreen: c.newtonMinGreen,
        newtonMinOrange: c.newtonMinOrange,
        lsiMinGreen: c.lsiMinGreen,
        lsiMinOrange: c.lsiMinOrange,
      }))
      // Koppelt status/measurementValue/measurementDate; negeert (in plaats
      // van per ongeluk toont) een status die niet bij dit criterium hoort.
      // Zie src/lib/rehab-traject.ts.
      const mergedCriteria = mergeCriterionStatuses(criteriaBase, statuses)
      const phaseTotal = mergedCriteria.length
      const phaseMet = mergedCriteria.filter((c) => c.status === 'MET').length
      const phaseInProgress = mergedCriteria.filter((c) => c.status === 'IN_PROGRESS').length
      return {
        id: phase.id,
        order: phase.order,
        shortName: phase.shortName,
        name: phase.name,
        description: phase.description,
        keyGoals: phase.keyGoals,
        typicalStartWeek: phase.typicalStartWeek,
        typicalEndWeek: phase.typicalEndWeek,
        progress: {
          total: phaseTotal,
          met: phaseMet,
          inProgress: phaseInProgress,
          pct: phaseTotal > 0 ? Math.round((phaseMet / phaseTotal) * 100) : 0,
        },
        criteria: mergedCriteria.map((c) => {
          const s = statusByCriterionId.get(c.id)
          return {
            ...c,
            status: c.status as 'NOT_MET' | 'IN_PROGRESS' | 'MET',
            notes: s?.notes ?? null,
            updatedAt: s?.updatedAt ?? null,
          }
        }),
      }
    }),
  }
}
