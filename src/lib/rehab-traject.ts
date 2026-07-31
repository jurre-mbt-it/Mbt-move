/** Eén criterium zoals het uit het protocol komt. */
export type CriterionLike = { id: string; [k: string]: unknown }
/** Eén vastgelegde status, altijd van één traject. */
export type StatusLike = {
  criterionId: string
  status: string
  measurementValue: string | null
  measurementDate: Date | null
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
