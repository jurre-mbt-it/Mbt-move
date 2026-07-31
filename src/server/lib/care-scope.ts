import { TRPCError } from '@trpc/server'

/**
 * Scope-sleutel voor PatientCareStatus. Een uitbehandel-markering geldt binnen
 * één praktijk of bij één coach, nooit globaal: dezelfde persoon kan tegelijk
 * coach-atleet en praktijk-patiënt zijn (patients.inviteCoMonitor maakt die
 * combinatie), en de coach-rol staat bewust buiten de praktijk (AGENTS.md).
 *
 * Bind de praktijk-tak expliciet aan de rol, niet aan een gevulde practiceId:
 * patiënten en atleten krijgen bij een invite dezelfde practiceId als hun
 * therapeut. Zonder die rol-binding zou elke patiënt de markeringen van elke
 * medepatiënt zien en kunnen zetten. Zelfde regel als practiceScope() in
 * patient-access.ts, met één bewust verschil: ADMIN valt hier wél in de
 * praktijk-tak, want een admin beheert vanuit zijn eigen praktijk.
 */
type ScopeUser = { id: string; role: string; practiceId: string | null }

/**
 * Precies één van beide is gevuld. De CHECK-constraint
 * `patient_care_status_one_scope` dwingt dezelfde regel af in de database.
 */
export type CareScopeKey =
  | { practiceId: string; coachId: null }
  | { practiceId: null; coachId: string }

/**
 * Schrijfvariant: gooit als er geen geldige scope is. Een rij aanmaken zonder
 * scope mag niet, want zo'n rij is daarna in geen enkele lijst terug te vinden.
 */
export function careScopeKey(user: ScopeUser): CareScopeKey {
  if (user.role === 'COACH') return { practiceId: null, coachId: user.id }
  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    if (!user.practiceId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Dit account hoort bij geen praktijk. Koppel eerst een praktijk.',
      })
    }
    return { practiceId: user.practiceId, coachId: null }
  }
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Alleen een therapeut of een coach kan de behandelstatus beheren.',
  })
}

/**
 * Where-fragment om de rijen van deze gebruiker te vinden. Nooit leeg: een
 * lege where zou in een OR-tak de scoping volledig laten wegvallen.
 *
 * Gooit dezelfde fouten als {@link careScopeKey}. Gebruik deze variant op
 * schrijfpaden. Zit het fragment in een lijst- of telquery, gebruik dan
 * {@link careScopeWhereForRead}, anders krijgt een account zonder praktijk een
 * foutmelding in plaats van zijn lijst.
 */
export function careScopeWhere(user: ScopeUser): { practiceId: string } | { coachId: string } {
  const key = careScopeKey(user)
  return key.coachId !== null ? { coachId: key.coachId } : { practiceId: key.practiceId }
}

/**
 * Matcht geen enkele rij. Vers object per aanroep, zodat een caller het mag
 * uitbreiden zonder de volgende aanroep te vervuilen.
 */
function matchtNiets(): { practiceId: { in: string[] } } {
  return { practiceId: { in: [] } }
}

/**
 * Leesvariant: gooit nooit. Zonder geldige scope (staf zonder praktijk, of een
 * rol die hier niets te zoeken heeft) komt er een filter uit dat geen enkele
 * rij matcht.
 *
 * Dat is in beide richtingen het veilige antwoord. Onder
 * `careStatuses: { none: careScopeWhereForRead(user) }` blijft iedereen actief,
 * en dat klopt: deze gebruiker heeft nooit iemand uitbehandeld. Onder
 * `{ some: ... }` blijft het archief leeg, en dat klopt ook.
 *
 * LAAT HET FILTER NOOIT WEG. Weglaten is bij `none` nog te verdedigen, maar bij
 * `some` fataal: dan komt het archief van de hele praktijk, of dat van elke
 * coach, in de lijst terecht. Eén helper voor beide richtingen houdt die
 * vergissing buiten de deur.
 */
export function careScopeWhereForRead(
  user: ScopeUser,
): { practiceId: string } | { coachId: string } | { practiceId: { in: string[] } } {
  if (user.role === 'COACH') return { coachId: user.id }
  if ((user.role === 'THERAPIST' || user.role === 'ADMIN') && user.practiceId) {
    return { practiceId: user.practiceId }
  }
  return matchtNiets()
}
