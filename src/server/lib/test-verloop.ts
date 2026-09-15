/**
 * Leest het verloop per test van één patiënt uit de database en geeft het aan
 * de pure rekenlaag (src/lib/test-report/verloop.ts).
 *
 * Geen access-check: de caller autoriseert. `testReports.myTestHistory` geeft
 * hier altijd `ctx.user.id` door, `testReports.historyForPatient` pas na de
 * behandelrelatiecheck.
 */
import type { PrismaClient } from '@prisma/client'

import { getPatientRehabTrackerData } from '@/lib/rehab-data'
import {
  bouwTestVerloop,
  type TestReeks,
  type VerloopCriterium,
  type VerloopRegel,
} from '@/lib/test-report/verloop'

export type TestVerloopData = {
  reeksen: TestReeks[]
  /** Er staan Kinvent-sprongen of -krachttests klaar op de metingenpagina. */
  heeftKinvent: boolean
}

export async function laadTestVerloop(
  prisma: PrismaClient,
  patientId: string,
  opties: { alleenDefinitief: boolean },
): Promise<TestVerloopData> {
  const entries = await prisma.testReportEntry.findMany({
    where: {
      report: { patientId, ...(opties.alleenDefinitief ? { status: 'FINAL' as const } : {}) },
    },
    select: {
      reportId: true,
      catalogItemId: true,
      name: true,
      subtitle: true,
      category: true,
      categoryOrder: true,
      source: true,
      kind: true,
      metric: true,
      unitPrimary: true,
      plotUnit: true,
      axisMin: true,
      axisMax: true,
      zoneOrangeMin: true,
      zoneGreenMin: true,
      higherIsBetter: true,
      leftPrimary: true,
      rightPrimary: true,
      singleValue: true,
      textValue: true,
      plottedValueOverride: true,
      zoneOverride: true,
      kinventProtocolCode: true,
      report: { select: { performedAt: true, status: true } },
    },
  })

  // Een Kinvent-import kan metingen van maanden terug in een rapport van
  // vandaag zetten. Voor de lijn telt de dag van de meting, niet die van het
  // rapport. Beide Kinvent-tabellen dragen die datum per protocol.
  const [sprongen, kracht] = await Promise.all([
    prisma.kinventJumpResult.findMany({ where: { patientId }, select: { protocolCode: true, performedAt: true } }),
    prisma.kinventStrengthResult.findMany({ where: { patientId }, select: { protocolCode: true, performedAt: true } }),
  ])
  const kinventDatum = new Map<string, Date>([...sprongen, ...kracht].map((r) => [r.protocolCode, r.performedAt]))

  const regels: VerloopRegel[] = entries.map(({ report, kinventProtocolCode, ...e }) => ({
    ...e,
    datum: (kinventProtocolCode && kinventDatum.get(kinventProtocolCode)) || report.performedAt,
    definitief: report.status === 'FINAL',
  }))

  const tracker = await getPatientRehabTrackerData(prisma, patientId)
  const criteria: VerloopCriterium[] = (tracker?.phases ?? []).flatMap((fase) =>
    fase.criteria.map((c) => ({
      id: c.id,
      catalogItemId: c.catalogItemId,
      name: c.name,
      phaseOrder: fase.order,
      phaseName: fase.name,
      status: c.status,
      isBilateral: c.isBilateral,
      lsiMinGreen: c.lsiMinGreen,
      newtonMinGreen: c.newtonMinGreen,
    })),
  )

  return {
    reeksen: bouwTestVerloop(regels, criteria, { alleenDefinitief: opties.alleenDefinitief }),
    heeftKinvent: sprongen.length + kracht.length > 0,
  }
}
