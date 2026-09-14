/**
 * Hamstring-quadricepsratio uit twee rapportregels.
 *
 * De catalogustest "H:Q ratio" plot een verhouding (as 0,4 tot 0,9; oranje
 * vanaf 0,5, groen vanaf 0,6). Zodra een rapport zowel een quadriceps- als
 * een hamstringregel heeft, rekenen we per zijde hamstring / quadriceps uit en
 * zetten dat in de H:Q-regel. Puur; de router doet het wegschrijven.
 */

export type HqRegel = {
  id: string
  catalogItemName: string
  leftPrimary: number | null
  rightPrimary: number | null
  unitPrimary: string | null
  importedAt: Date | null
}

type Zijden = { left: number | null; right: number | null }

function verhouding(ham: number | null, quad: number | null): number | null {
  if (ham === null || quad === null || quad <= 0 || ham < 0) return null
  return Math.round((ham / quad) * 100) / 100
}

export function hqRatio(quad: Zijden, ham: Zijden): Zijden {
  return { left: verhouding(ham.left, quad.left), right: verhouding(ham.right, quad.right) }
}

const isQuad = (r: HqRegel) => /quadriceps/i.test(r.catalogItemName)
const isHam = (r: HqRegel) => /hamstring/i.test(r.catalogItemName)

function laatste(regels: HqRegel[]): HqRegel | null {
  if (regels.length === 0) return null
  return regels.reduce((top, r) => ((r.importedAt?.getTime() ?? 0) > (top.importedAt?.getTime() ?? 0) ? r : top), regels[0])
}

/** De quadriceps- en hamstringregel van een rapport; bij dubbelen de laatst geïmporteerde. */
export function kiesHqPaar(regels: HqRegel[]): { quad: HqRegel; ham: HqRegel } | null {
  const quad = laatste(regels.filter(isQuad))
  const ham = laatste(regels.filter(isHam))
  if (!quad || !ham) return null
  return { quad, ham }
}
