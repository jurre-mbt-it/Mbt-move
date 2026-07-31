import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { careScopeWhereForRead, type ScopeUser } from './care-scope'

export const NIET_PLANNEN_VOOR_INACTIEVE =
  'Deze patiënt staat op inactief. Zet hem eerst weer in behandeling om te kunnen plannen.'

/**
 * Weigert nieuwe planning voor een uitbehandelde patiënt.
 *
 * Losse guard, geen aanpassing van hasPatientAccess: het dossier moet leesbaar
 * blijven en bestaande planning moet aan te passen zijn, alleen bíjplannen
 * stopt. Zet hem daarom op de bulk-planners en niet op elke schrijfactie.
 *
 * Scope-gebonden: alleen wie zélf heeft afgesloten wordt tegengehouden. Een
 * praktijk-therapeut die doorbehandelt kan gewoon plannen nadat een coach zijn
 * eigen begeleiding heeft afgerond, en andersom.
 *
 * Bewust `careScopeWhereForRead` en niet de gooiende schrijfvariant: dit is een
 * status-check, geen rechtencheck. `careScopeWhere` gooit voor een rol die geen
 * markering kán zetten (een atleet die in programs.create een eigen programma
 * bouwt) en voor een therapeut zonder praktijk; die zouden dan geen programma
 * meer kunnen aanmaken. De leesvariant levert voor hen een filter dat niets
 * matcht, dus geen markering en geen blokkade. Dat klopt ook inhoudelijk: wie
 * niemand kan uitbehandelen, heeft deze patiënt niet uitbehandeld.
 */
export async function assertNotDischarged(
  prisma: PrismaClient,
  user: ScopeUser,
  patientId: string,
): Promise<void> {
  const rij = await prisma.patientCareStatus.findFirst({
    // careScopeWhereForRead bakt `reactivatedAt: null` in, dus een afgeronde
    // periode uit de historie blokkeert niet. Rijen blijven staan; het bestaan
    // van een rij is NIET de status.
    where: { patientId, ...careScopeWhereForRead(user) },
    select: { id: true },
  })
  if (rij) {
    throw new TRPCError({ code: 'CONFLICT', message: NIET_PLANNEN_VOOR_INACTIEVE })
  }
}
