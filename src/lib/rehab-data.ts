import type { PrismaClient } from '@prisma/client'

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

export async function getPatientRehabTrackerData(
  prisma: PrismaClient,
  patientId: string,
) {
  const tracker = await prisma.patientRehabTracker.findFirst({
    where: { patientId, deactivatedAt: null },
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
  const statuses = criterionIds.length
    ? await prisma.rehabCriterionStatus.findMany({
        where: { patientId, criterionId: { in: criterionIds } },
      })
    : []
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
    patientId,
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
    activatedByName: tracker.activatedBy.name ?? tracker.activatedBy.email,
    notes: tracker.notes,
    weeksSinceSurgery,
    expectedPhaseOrder,
    progress: { total, met, inProgress, pct: progressPct },
    phases: tracker.protocol.phases.map((phase) => {
      const phaseStatuses = phase.criteria.map((c) => statusByCriterionId.get(c.id))
      const phaseTotal = phase.criteria.length
      const phaseMet = phaseStatuses.filter((s) => s?.status === 'MET').length
      const phaseInProgress = phaseStatuses.filter((s) => s?.status === 'IN_PROGRESS').length
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
        criteria: phase.criteria.map((c) => {
          const s = statusByCriterionId.get(c.id)
          return {
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
            status: (s?.status ?? 'NOT_MET') as 'NOT_MET' | 'IN_PROGRESS' | 'MET',
            measurementValue: s?.measurementValue ?? null,
            measurementDate: s?.measurementDate ?? null,
            notes: s?.notes ?? null,
            updatedAt: s?.updatedAt ?? null,
          }
        }),
      }
    }),
  }
}
