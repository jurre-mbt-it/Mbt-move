// Mobiliteits-oefeningen belasten geen spiergroepen. Maskeer muscleLoads zodat
// ze niet meetellen in workload-, recovery- of dashboard-berekeningen.

const NO_LOAD_CATEGORIES = new Set(['MOBILITY'])

type MuscleLoadRow = { muscle: string; load: number }

export function muscleLoadsRecord(ex: {
  category: string
  muscleLoads: MuscleLoadRow[]
}): Record<string, number> {
  if (NO_LOAD_CATEGORIES.has(ex.category)) return {}
  return Object.fromEntries(ex.muscleLoads.map(ml => [ml.muscle, ml.load]))
}

export function maskMuscleLoadsArray<
  T extends { category: string; muscleLoads: MuscleLoadRow[] },
>(ex: T): T {
  if (NO_LOAD_CATEGORIES.has(ex.category)) {
    return { ...ex, muscleLoads: [] as MuscleLoadRow[] } as T
  }
  return ex
}
