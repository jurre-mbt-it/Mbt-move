import type { PrismaClient } from '@prisma/client'
import { careScopeKeyOrNull, careScopeWhereForRead, type ScopeUser } from './care-scope'

/**
 * `geen-scope` = deze behandelaar kán helemaal geen markering hebben gezet (een
 * therapeut zonder praktijk, of een rol die hier niets te zoeken heeft). De
 * markering blijft dan staan; de caller hoort dat te loggen in plaats van blind
 * alles op te heffen.
 */
export type OpheffenResultaat =
  | { status: 'opgeheven'; aantal: number }
  | { status: 'geen-scope' }

/**
 * Opnieuw uitnodigen betekent weer in behandeling: hef de uitbehandel-markering
 * van DEZE behandelaar op.
 *
 * Zonder dit krijg je een patiënt met een levende koppeling die in geen enkele
 * lijst verschijnt en nergens een foutmelding geeft. Dat is het moeilijkst
 * herkenbare eindresultaat van deze hele feature: de therapeut nodigt uit, de
 * patiënt accepteert, en daarna lijkt er niets te gebeuren.
 *
 * Afstempelen, niet verwijderen, gelijk aan `patients.reactivate`. De reden en
 * de toelichting van de afgesloten periode zijn een klinisch oordeel dat
 * vanwege de PII-regel niet in de audit-log staat en dus met een DELETE
 * definitief weg zou zijn.
 *
 * Scope-gebonden: een praktijk heft geen coach-markering op en andersom. De
 * `reactivatedAt: null`-voorwaarde zit in het scope-fragment, dus een eerder
 * afgesloten periode uit de historie wordt niet opnieuw afgestempeld.
 *
 * Let op: programma's die bij het archiveren zijn dichtgezet (`closedByDischarge`)
 * komen hier NIET terug. Opnieuw uitnodigen is een nieuwe start, geen
 * voortzetting van het oude schema; de therapeut zet zelf klaar wat er moet staan.
 */
export async function hefUitbehandeldOp(
  prisma: Pick<PrismaClient, 'patientCareStatus'>,
  behandelaar: ScopeUser,
  patientId: string,
): Promise<OpheffenResultaat> {
  if (!careScopeKeyOrNull(behandelaar)) return { status: 'geen-scope' }
  const { count } = await prisma.patientCareStatus.updateMany({
    where: { patientId, ...careScopeWhereForRead(behandelaar) },
    data: { reactivatedAt: new Date(), reactivatedById: behandelaar.id },
  })
  return { status: 'opgeheven', aantal: count }
}
