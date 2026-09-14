/**
 * Voorstel welke catalogustest bij een Kinvent-meting hoort, en een teller
 * voor de nachtelijke controle.
 *
 * Een rapportregel werkt een rehab-criterium alleen bij als hij aan een
 * catalogustest hangt (`catalogItemId`, zie rehab-criterion-sync.ts). Kinvent
 * kent onze catalogus niet, dus we raden op de titel van de oefening. De
 * therapeut ziet het voorstel in de importdialoog en kan het altijd wijzigen
 * of leegmaken. Niet herkend is niet erg: dan komt de meting gewoon als losse
 * regel in het rapport.
 */

export type CatalogusOptie = {
  id: string
  name: string
  category: string
  kind: string
  unitPrimary: string | null
}

export type MatchInvoer = {
  kind: 'STRENGTH' | 'JUMP'
  exerciseType: string | null
  title: string | null
  /** Kracht: links én rechts gemeten. Sprong: tweebenig. */
  bilateral: boolean
  jumpType?: string | null
}

function bevat(tekst: string, ...woorden: string[]): boolean {
  return woorden.some((w) => tekst.includes(w))
}

export function suggestCatalogItem(m: MatchInvoer, catalogus: CatalogusOptie[]): string | null {
  const t = (m.title ?? '').toLowerCase()

  if (m.kind === 'JUMP') {
    if (!m.bilateral || m.jumpType !== 'CMJ') return null
    return catalogus.find((c) => c.kind === 'SINGLE' && c.name.toLowerCase().includes('cmj'))?.id ?? null
  }

  if (!m.bilateral) return null
  const bilateraal = catalogus.filter((c) => c.kind === 'BILATERAL')
  const vind = (...woorden: string[]) =>
    bilateraal.find((c) => bevat(c.name.toLowerCase(), ...woorden))?.id ?? null

  if (
    m.exerciseType === 'NORDIC_HAMSTRING' ||
    bevat(t, 'hamstring', 'knieflexie') ||
    (t.includes('knee') && t.includes('flexion'))
  ) {
    return vind('hamstring')
  }
  if (bevat(t, 'knee_extension', 'knee extension', 'knie-extensie', 'knieextensie', 'quadriceps', 'quad')) {
    return vind('quadriceps')
  }
  if (bevat(t, 'plantar', 'calf', 'kuit')) {
    return vind('kuit', 'calf', 'plantair')
  }
  return null
}

/** Protocollen bij Kinvent waarvan nog niets in BASE is geïmporteerd. */
export function countPending(protocols: Array<{ code: string }>, known: Set<string>): number {
  return protocols.filter((p) => !known.has(p.code)).length
}
