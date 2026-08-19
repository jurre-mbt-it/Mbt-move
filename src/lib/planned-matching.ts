/**
 * Welke geplande items van de patiënt-kalender zijn al "gedaan"?
 *
 * De atleet-kalender toont per dag de gelogde sessies plus de geplande items
 * die daar nog niet mee zijn afgevinkt. De vraag "is dit item al gedaan?" was
 * eerder een blinde teller per dag: elke cardio-log op die datum vinkte een
 * willekeurig gepland cardio-item af. Wie op maandag ging hardlopen terwijl er
 * fietsen gepland stond, zag daardoor het geplande fietsritje verdwijnen — de
 * planning leek "overschreven" door wat er werkelijk gedaan was.
 *
 * Daarom hier één plek met de volgorde: identiteit eerst (de log wijst zelf het
 * item aan), dan een heuristiek die alleen nog naar ONgekoppelde logs kijkt en
 * die de activiteit respecteert. Geen match = het geplande item blijft staan.
 */

/** Een afgeronde kracht-/programmasessie, al op dagniveau gebracht. */
export type LoggedSession = {
  iso: string
  programId: string | null
  /** Gevuld = deze sessie hangt al aan een gepland item; niet meer vrij te geven. */
  itemId: string | null
}

/** Een afgeronde cardio-sessie, al op dagniveau gebracht. */
export type LoggedCardio = {
  iso: string
  /** CardioActivity, bv. RUNNING / CYCLING. */
  activity: string
  /** Gevuld = deze log hangt al aan een gepland item. */
  itemId: string | null
}

/** Eén gepland item op één dag. */
export type PlannedEntry = {
  /** Unieke sleutel binnen de aanroep; komt terug in de resultaat-set. */
  key: string
  iso: string
  programId: string | null
  /** Afgeleide categorie (quickCategory ?? 'STRENGTH'). */
  category: string
  /** Bij cardio: de geplande activiteit, of null voor "gewoon cardio". */
  activity: string | null
  /** Hangt er al een sessie- of cardio-log aan dít item? */
  hasOwnLog: boolean
}

/**
 * Geeft de sleutels terug van de items die als gelogd mogen gelden. Alles wat
 * er niet in zit hoort zichtbaar te blijven als planning.
 */
export function matchLoggedPlanned(
  planned: PlannedEntry[],
  logs: { sessions: LoggedSession[]; cardio: LoggedCardio[] },
): Set<string> {
  const matched = new Set<string>()

  // Alleen logs die nog nergens aan hangen mogen een item afvinken. Een log die
  // al bij item X hoort mag item Y op dezelfde dag niet stilletjes opeten.
  const vrijeCardio = new Map<string, LoggedCardio[]>()
  for (const c of logs.cardio) {
    if (c.itemId) continue
    vrijeCardio.set(c.iso, [...(vrijeCardio.get(c.iso) ?? []), c])
  }
  const programmasPerDag = new Map<string, Set<string>>()
  const losseSessiesPerDag = new Map<string, number>()
  for (const s of logs.sessions) {
    if (s.itemId) continue
    if (s.programId) {
      const set = programmasPerDag.get(s.iso) ?? new Set<string>()
      set.add(s.programId)
      programmasPerDag.set(s.iso, set)
    } else {
      losseSessiesPerDag.set(s.iso, (losseSessiesPerDag.get(s.iso) ?? 0) + 1)
    }
  }

  const rest: PlannedEntry[] = []
  for (const p of planned) {
    if (p.hasOwnLog) {
      matched.add(p.key)
      continue
    }
    rest.push(p)
  }

  // Een programma-item matcht op programma-identiteit, niet op een teller.
  const zonderProgramma: PlannedEntry[] = []
  for (const p of rest) {
    if (p.programId) {
      if (programmasPerDag.get(p.iso)?.has(p.programId)) matched.add(p.key)
      continue
    }
    zonderProgramma.push(p)
  }

  const neemCardio = (p: PlannedEntry, wilActiviteit: boolean): boolean => {
    const pool = vrijeCardio.get(p.iso)
    if (!pool || pool.length === 0) return false
    const idx = wilActiviteit ? pool.findIndex(c => c.activity === p.activity) : 0
    if (idx === -1) return false
    pool.splice(idx, 1)
    return true
  }

  // Eerst de items die een activiteit noemen: een geplande duurloop hoort de
  // gelogde duurloop te krijgen, niet het generieke "Cardio" ernaast.
  const cardioItems = zonderProgramma.filter(p => p.category === 'CARDIO')
  for (const p of cardioItems) {
    if (p.activity && neemCardio(p, true)) matched.add(p.key)
  }
  for (const p of cardioItems) {
    if (matched.has(p.key)) continue
    // Zonder geplande activiteit valt niets te vergelijken; dan is elke
    // overgebleven cardio van die dag de beste gok die we hebben.
    if (!p.activity && neemCardio(p, false)) matched.add(p.key)
  }

  // Losse (niet-cardio, niet-programma) workouts: hier bestaat geen scherper
  // signaal dan "er is die dag een losse sessie gelogd".
  for (const p of zonderProgramma) {
    if (p.category === 'CARDIO' || matched.has(p.key)) continue
    const over = losseSessiesPerDag.get(p.iso) ?? 0
    if (over > 0) {
      losseSessiesPerDag.set(p.iso, over - 1)
      matched.add(p.key)
    }
  }

  return matched
}
