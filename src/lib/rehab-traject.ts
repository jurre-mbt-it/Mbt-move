/** Eén criterium zoals het uit het protocol komt. */
export type CriterionLike = { id: string; [k: string]: unknown }
/** Eén vastgelegde status, altijd van één traject. */
export type StatusLike = {
  criterionId: string
  status: string
  measurementValue: string | null
  measurementDate: Date | null
}
/** Een status zoals hij uit de database komt, dus mét zijn traject. */
export type StatusRij = { trackerId: string; criterionId: string }

/**
 * Houdt alleen de statussen over die bij dít traject horen én bij een
 * criterium van het protocol van dat traject.
 *
 * Dit is de plek waar kruisbesmetting tussen trajecten wordt gestopt. Twee
 * trajecten op HETZELFDE protocol delen dezelfde criterionIds, dus filteren op
 * criterium alleen is niet genoeg: de trackerId moet meebeslissen. De
 * where-clausule in `getRehabTrackerDataById` selecteert al op beide, maar die
 * staat in de datalaag en is niet te testen zonder database. Deze functie
 * draait er daarna nog een keer overheen, zodat een regressie in die
 * where-clausule (terug naar `{ patientId }`, zoals het vóór het episode-model
 * was) geen vinkjes van een afgesloten traject in een nieuw traject laat
 * opduiken.
 *
 * De criteria-grens is ook een rekenkundige: zonder die begrenzing kunnen
 * `met` en `inProgress` hoger uitvallen dan `total`.
 */
export function statussenVanTraject<T extends StatusRij>(
  statuses: T[],
  trackerId: string,
  criterionIds: string[],
): T[] {
  const vanProtocol = new Set(criterionIds)
  return statuses.filter(
    (s) => s.trackerId === trackerId && vanProtocol.has(s.criterionId),
  )
}

/**
 * Voegt de vastgelegde statussen bij de criteria van een protocol. Criteria
 * zonder status krijgen NOT_MET; statussen die bij geen enkel criterium horen
 * worden genegeerd in plaats van toegevoegd.
 */
export function mergeCriterionStatuses<T extends CriterionLike>(
  criteria: T[],
  statuses: StatusLike[],
) {
  const perCriterium = new Map(statuses.map((s) => [s.criterionId, s]))
  return criteria.map((c) => {
    const s = perCriterium.get(c.id)
    return {
      ...c,
      status: s?.status ?? 'NOT_MET',
      measurementValue: s?.measurementValue ?? null,
      measurementDate: s?.measurementDate ?? null,
    }
  })
}
