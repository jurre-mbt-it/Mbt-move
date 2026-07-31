import type { PrismaClient } from '@prisma/client'
import {
  careScopeKeyOrNull,
  careScopeWhereForRead,
  programmaScope,
  type ScopeUser,
} from './care-scope'

/**
 * `geen-scope` = deze behandelaar kán helemaal geen markering hebben gezet (een
 * therapeut zonder praktijk, of een rol die hier niets te zoeken heeft). De
 * markering blijft dan staan; de caller hoort dat te loggen in plaats van blind
 * alles op te heffen.
 */
export type OpheffenResultaat =
  | { status: 'opgeheven'; aantal: number }
  | { status: 'geen-scope' }

/** Alleen deze twee modellen worden geraakt, zodat een transactie-client past. */
type CareClient = Pick<PrismaClient, 'patientCareStatus' | 'program'>

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
 * PROGRAMMA'S KOMEN HIER NIET TERUG, maar de vlag gaat wel uit. Opnieuw
 * uitnodigen is een nieuwe start en geen voortzetting van het oude schema, dus
 * de therapeut zet zelf klaar wat er moet staan. `closedByDischarge` moet dan
 * wél mee opgeruimd worden: die vlag betekent "hoort bij een LOPENDE
 * afsluiting", en `patients.reactivate` is de enige plek die hem ooit op false
 * zet. Die eist eerst een lopende markering, dus zonder deze reset blijft de
 * vlag na een re-invite voor altijd staan en komt dat oude programma bij een
 * vólgende afsluiting mee terug op ACTIVE, met een startdatum die over de
 * verkeerde onderbreking is opgeschoven.
 *
 * Roep dit aan binnen dezelfde transactie als de koppeling-activering. Faalt de
 * tweede helft los, dan sta je precies in de toestand die dit moet wegnemen.
 *
 * @param doorId Wie de reactivering veroorzaakt. Standaard de behandelaar zelf.
 *   `patients.inviteCoMonitor` geeft hier de coach mee die de meekijker
 *   uitnodigt, want de scope is daar die van de uitgenodigde therapeut.
 */
export async function hefUitbehandeldOp(
  prisma: CareClient,
  behandelaar: ScopeUser,
  patientId: string,
  doorId: string = behandelaar.id,
): Promise<OpheffenResultaat> {
  const scope = careScopeKeyOrNull(behandelaar)
  if (!scope) return { status: 'geen-scope' }
  const { count } = await prisma.patientCareStatus.updateMany({
    where: { patientId, ...careScopeWhereForRead(behandelaar) },
    data: { reactivatedAt: new Date(), reactivatedById: doorId },
  })
  if (count > 0) {
    // Alleen de vlag, niet de status: wat dicht is blijft dicht.
    await prisma.program.updateMany({
      where: { patientId, closedByDischarge: true, ...programmaScope(scope, behandelaar.id) },
      data: { closedByDischarge: false },
    })
  }
  return { status: 'opgeheven', aantal: count }
}
