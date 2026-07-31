/**
 * Scope-sleutel voor PatientCareStatus. Een uitbehandel-markering geldt binnen
 * één praktijk of bij één coach, nooit globaal: dezelfde persoon kan tegelijk
 * coach-atleet en praktijk-patiënt zijn (patients.inviteCoMonitor maakt die
 * combinatie), en de coach-rol staat bewust buiten de praktijk (AGENTS.md).
 *
 * Bind de praktijk-tak expliciet aan de rol, niet aan een gevulde practiceId:
 * patiënten en atleten krijgen bij een invite dezelfde practiceId als hun
 * therapeut.
 */
type ScopeUser = { id: string; role: string; practiceId: string | null }

export function careScopeKey(user: ScopeUser): {
  practiceId: string | null
  coachId: string | null
} {
  if (user.role === 'COACH') return { practiceId: null, coachId: user.id }
  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    if (!user.practiceId) {
      throw new Error('Deze therapeut hoort bij geen praktijk; koppel eerst een praktijk.')
    }
    return { practiceId: user.practiceId, coachId: null }
  }
  throw new Error(`Rol ${user.role} mag geen behandelstatus zetten`)
}

/** Where-fragment om de rijen van deze lezer te vinden. Nooit leeg. */
export function careScopeWhere(user: ScopeUser): { practiceId: string } | { coachId: string } {
  const key = careScopeKey(user)
  return key.coachId ? { coachId: key.coachId } : { practiceId: key.practiceId! }
}
