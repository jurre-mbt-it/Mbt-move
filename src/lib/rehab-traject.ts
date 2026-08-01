/**
 * Uitkomst van een revalidatietraject in gewone taal.
 *
 * Dezelfde waarden als `RehabTrajectOutcome` in het schema en als de zod-enum
 * van `rehab.closeTraject`. Eén bron, zodat de keuzelijst bij het afsluiten en
 * de historie-lijst niet uit elkaar lopen. Zelfde opzet als
 * `DISCHARGE_REASON_LABEL` in care-status.ts.
 */
export const TRAJECT_OUTCOMES = [
  'COMPLETED',
  'DISCONTINUED',
  'TRANSFERRED',
  'RELAPSE',
  'UNKNOWN',
] as const

export type TrajectOutcome = (typeof TRAJECT_OUTCOMES)[number]

/** Label in de keuzelijst: wat je kiest op het moment van afsluiten. */
export const TRAJECT_OUTCOME_LABEL: Record<TrajectOutcome, string> = {
  COMPLETED: 'Criteria behaald',
  DISCONTINUED: 'Voortijdig gestopt',
  TRANSFERRED: 'Doorverwezen of overgedragen',
  RELAPSE: 'Terugval',
  UNKNOWN: 'Geen uitkomst vastleggen',
}

/**
 * Dezelfde uitkomst, teruglezend geformuleerd voor de historie. In de
 * keuzelijst kies je iets, in het dossier lees je een stand van zaken.
 */
export const TRAJECT_OUTCOME_TERUGLEZEND: Record<TrajectOutcome, string> = {
  COMPLETED: 'criteria behaald',
  DISCONTINUED: 'voortijdig gestopt',
  TRANSFERRED: 'doorverwezen of overgedragen',
  RELAPSE: 'terugval',
  UNKNOWN: 'geen uitkomst vastgelegd',
}

/**
 * Enum-waarde uit de database omzetten naar tekst voor de historie.
 *
 * Leeg blijft niet leeg: trajecten die vóór het uitkomst-veld zijn afgesloten,
 * en trajecten die de app via `deactivateForPatient` heeft dichtgezet, hebben
 * `outcome` null. Dat is geen ontbrekende data maar hetzelfde verhaal als
 * UNKNOWN, en zo staat het er ook. Een waarde die deze bundel nog niet kent
 * valt terug op de ruwe enum in plaats van op een lege regel.
 */
export function trajectOutcomeTekst(outcome: string | null | undefined): string {
  if (!outcome) return TRAJECT_OUTCOME_TERUGLEZEND.UNKNOWN
  return TRAJECT_OUTCOME_TERUGLEZEND[outcome as TrajectOutcome] ?? outcome
}

/**
 * De looptijd van een traject als één regel: "4 mei 2026 tot 20 juli 2026".
 *
 * Een lopend traject heeft geen einddatum en krijgt daarom "loopt nog"; dat is
 * eerlijker dan een streepje, dat ook "onbekend" kan betekenen.
 */
export function trajectPeriode(
  activatedAt: Date | string | null | undefined,
  deactivatedAt: Date | string | null | undefined,
): string {
  const van = trajectDatum(activatedAt)
  const tot = trajectDatum(deactivatedAt)
  if (!van) return tot ? `tot ${tot}` : 'periode onbekend'
  return tot ? `${van} tot ${tot}` : `${van}, loopt nog`
}

/** Datum zoals hij in de historie staat: 4 mei 2026. Null bij onbruikbare invoer. */
export function trajectDatum(at: Date | string | null | undefined): string | null {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

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

/** Eén traject zoals `rehab.getMyLastClosedTraject` het nodig heeft om te kiezen. */
export type TrajectKiesbaar = { id: string; activatedAt: Date; deactivatedAt: Date | null }

/**
 * Bepaalt wat `rehab.getMyLastClosedTraject` aan de patiënt teruggeeft,
 * gegeven ALLE trajecten van die patiënt, in willekeurige volgorde.
 *
 * Een lopend traject (deactivatedAt null) wint altijd en levert null op: dan
 * is "is mijn traject afgesloten" niet de vraag die voorligt, en hoort het
 * gewone scherm te tonen, niet een afsluit-melding over een oud traject
 * terwijl er alweer een nieuw loopt.
 *
 * Zonder lopend traject is het antwoord het meest recent afgesloten traject
 * (op deactivatedAt, met id als tweede sleutel bij een gelijkspel, zelfde
 * aanpak als findOpenTracker in rehab-data.ts), of null als de patiënt nooit
 * een traject heeft gehad.
 */
export function laatsteAfgeslotenTraject<T extends TrajectKiesbaar>(trajecten: T[]): T | null {
  if (trajecten.some((t) => t.deactivatedAt === null)) return null

  let laatste: (T & { deactivatedAt: Date }) | null = null
  for (const t of trajecten) {
    if (t.deactivatedAt === null) continue
    const kandidaat = t as T & { deactivatedAt: Date }
    if (
      !laatste ||
      kandidaat.deactivatedAt > laatste.deactivatedAt ||
      (kandidaat.deactivatedAt.getTime() === laatste.deactivatedAt.getTime() &&
        kandidaat.id > laatste.id)
    ) {
      laatste = kandidaat
    }
  }
  return laatste
}
