/**
 * Welke geplande items zijn al "gedaan"?
 *
 * Zowel de atleet-kalender als de therapeut-week-planner zetten geplande items
 * naast de logs van de patiënt. De vraag "hoort deze log bij dit geplande item?"
 * was op beide plekken een blinde teller per dag: elke cardio-log op die datum
 * vinkte een willekeurig gepland cardio-item af. Wie ging hardlopen terwijl er
 * fietsen gepland stond, zag daardoor het geplande fietsritje verdwijnen (atleet)
 * of ten onrechte als voltooid staan (therapeut).
 *
 * Daarom hier één plek met de volgorde:
 *   1. identiteit — de log wijst het item zelf aan (weekScheduleDayItemId);
 *   2. programma-identiteit — zelfde programma op dezelfde dag;
 *   3. activiteit — een geplande duurloop krijgt de gelogde duurloop;
 *   4. generiek — pas als het plan geen activiteit noemt telt elke cardio mee.
 *
 * Stap 2 t/m 4 kijken alleen naar logs die NOG NERGENS aan hangen: een log die
 * bij item A hoort mag item B op dezelfde dag niet stilletjes opeten. Geen match
 * = het geplande item blijft staan als planning.
 */

/** Een afgeronde kracht-/programmasessie, al op dagniveau gebracht. */
export type LoggedSession = {
  id: string
  iso: string
  programId: string | null
  /** Gevuld = deze sessie hangt al aan een gepland item. */
  itemId: string | null
}

/** Een afgeronde cardio-sessie, al op dagniveau gebracht. */
export type LoggedCardio = {
  id: string
  iso: string
  /** CardioActivity, bv. RUNNING / CYCLING. */
  activity: string
  /** Gevuld = deze log hangt al aan een gepland item. */
  itemId: string | null
}

/** Eén gepland item op één dag. */
export type PlannedEntry = {
  /** Unieke sleutel binnen de aanroep; komt terug in het resultaat. */
  key: string
  iso: string
  /** Echte WeekScheduleDayItem-id waar logs aan kunnen hangen; null bij een
   *  synthetische/legacy tegel. */
  itemId?: string | null
  programId: string | null
  /** Afgeleide categorie (quickCategory ?? 'STRENGTH'). */
  category: string
  /** Bij cardio: de geplande activiteit, of null voor "gewoon cardio". */
  activity: string | null
  /** Het item weet zelf al dat er een log aan hangt — nodig als die log buiten
   *  het opgehaalde venster valt en dus niet in `logs` zit. */
  hasOwnLog?: boolean
}

/** Waaraan is het item afgevinkt? `own` = het item meldde zelf een log die
 *  buiten het opgehaalde venster viel. */
export type PlannedMatch<S extends LoggedSession, C extends LoggedCardio> =
  | { source: 'own'; log: null }
  | { source: 'session'; log: S }
  | { source: 'cardio'; log: C }

/**
 * Geeft per gepland item terug welke log het afvinkt. Items die er niet in
 * zitten horen zichtbaar te blijven als planning.
 */
export function matchLoggedPlanned<S extends LoggedSession, C extends LoggedCardio>(
  planned: PlannedEntry[],
  logs: { sessions: S[]; cardio: C[] },
): Map<string, PlannedMatch<S, C>> {
  const result = new Map<string, PlannedMatch<S, C>>()

  // ── 1. Identiteit ────────────────────────────────────────────────────────
  // De patiënt startte dit item vanuit de kalender, dus de log noemt het item.
  const cardioByItem = new Map<string, C[]>()
  for (const c of logs.cardio) {
    if (!c.itemId) continue
    cardioByItem.set(c.itemId, [...(cardioByItem.get(c.itemId) ?? []), c])
  }
  const sessionByItem = new Map<string, S[]>()
  for (const s of logs.sessions) {
    if (!s.itemId) continue
    sessionByItem.set(s.itemId, [...(sessionByItem.get(s.itemId) ?? []), s])
  }

  const rest: PlannedEntry[] = []
  for (const p of planned) {
    const c = p.itemId ? cardioByItem.get(p.itemId)?.[0] : undefined
    if (c) {
      result.set(p.key, { source: 'cardio', log: c })
      continue
    }
    const s = p.itemId ? sessionByItem.get(p.itemId)?.[0] : undefined
    if (s) {
      result.set(p.key, { source: 'session', log: s })
      continue
    }
    if (p.hasOwnLog) {
      result.set(p.key, { source: 'own', log: null })
      continue
    }
    rest.push(p)
  }

  // Vanaf hier alleen nog logs die nergens aan hangen.
  const vrijeCardio = new Map<string, C[]>()
  for (const c of logs.cardio) {
    if (c.itemId) continue
    vrijeCardio.set(c.iso, [...(vrijeCardio.get(c.iso) ?? []), c])
  }
  const programmasPerDag = new Map<string, S[]>()
  const losseSessiesPerDag = new Map<string, S[]>()
  for (const s of logs.sessions) {
    if (s.itemId) continue
    const bucket = s.programId ? programmasPerDag : losseSessiesPerDag
    bucket.set(s.iso, [...(bucket.get(s.iso) ?? []), s])
  }

  // ── 2. Programma-identiteit ──────────────────────────────────────────────
  // Bewust niet-consumerend: twee keer hetzelfde programma op één dag plannen
  // en één keer loggen is zeldzaam, en de programma-naam is al een sterk
  // signaal. Wél telt alleen een sessie die nog nergens aan hangt.
  const zonderProgramma: PlannedEntry[] = []
  for (const p of rest) {
    if (p.programId) {
      const hit = programmasPerDag.get(p.iso)?.find(s => s.programId === p.programId)
      if (hit) result.set(p.key, { source: 'session', log: hit })
      continue
    }
    zonderProgramma.push(p)
  }

  const neemCardio = (p: PlannedEntry, opActiviteit: boolean): C | undefined => {
    const pool = vrijeCardio.get(p.iso)
    if (!pool || pool.length === 0) return undefined
    const idx = opActiviteit ? pool.findIndex(c => c.activity === p.activity) : 0
    if (idx === -1) return undefined
    return pool.splice(idx, 1)[0]
  }

  // ── 3. Cardio op activiteit ──────────────────────────────────────────────
  // Eerst de items die een activiteit noemen: een geplande duurloop hoort de
  // gelogde duurloop te krijgen, niet het generieke "Cardio" ernaast.
  const cardioItems = zonderProgramma.filter(p => p.category === 'CARDIO')
  for (const p of cardioItems) {
    if (!p.activity) continue
    const log = neemCardio(p, true)
    if (log) result.set(p.key, { source: 'cardio', log })
  }

  // ── 4. Generieke cardio ──────────────────────────────────────────────────
  for (const p of cardioItems) {
    if (result.has(p.key) || p.activity) continue
    // Zonder geplande activiteit valt niets te vergelijken; dan is elke
    // overgebleven cardio van die dag de beste gok die we hebben.
    const log = neemCardio(p, false)
    if (log) result.set(p.key, { source: 'cardio', log })
  }

  // ── 5. Losse workouts ────────────────────────────────────────────────────
  // Niet-cardio zonder programma: hier bestaat geen scherper signaal dan "er is
  // die dag een losse sessie gelogd".
  for (const p of zonderProgramma) {
    if (p.category === 'CARDIO' || result.has(p.key)) continue
    const pool = losseSessiesPerDag.get(p.iso)
    if (!pool || pool.length === 0) continue
    result.set(p.key, { source: 'session', log: pool.splice(0, 1)[0] })
  }

  return result
}
