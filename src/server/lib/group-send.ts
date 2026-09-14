import { addDaysKey } from '@/lib/week-dates'

/**
 * Wat "Stuur naar iedereen" per lid en per week gaat doen, als pure functie
 * zodat de regels zonder database te testen zijn:
 *  - per gekozen groepsweek de week van het lid op dezelfde maandag zoeken
 *    (null = aanmaken);
 *  - in die week alle items van deze groep verwijderen, behalve op dagen vóór
 *    vandaag en items met een gelogde sessie;
 *  - de groepsitems van dagen vanaf vandaag kopiëren, behalve op een dag waar
 *    de atleet de groepstraining al gelogd heeft (anders staat hij er twee keer),
 *    en behalve lege trainingen (`leeg`): die zijn bij de atleet alleen ruis.
 * Eigen items, andere groepen en andere programma's blijven staan.
 */
export type GroepsWeek = { id: string; monday: string; days: { dayOfWeek: number; items: { id: string; leeg?: boolean }[] }[] }
export type LidWeek = { id: string; monday: string; items: { id: string; dayOfWeek: number; groupId: string | null; gelogd: boolean }[] }
export type VerzendStap = {
  monday: string
  lidWeekId: string | null
  verwijderen: string[]
  kopieren: { bronItemId: string; dayOfWeek: number }[]
}

export function planVerzending(args: { groupId: string; groepsWeken: GroepsWeek[]; lidWeken: LidWeek[]; vandaag: string }): VerzendStap[] {
  const { groupId, groepsWeken, lidWeken, vandaag } = args
  const lidPerMaandag = new Map(lidWeken.map(w => [w.monday, w]))
  const stappen: VerzendStap[] = []
  for (const gw of groepsWeken) {
    const nogNietVoorbij = (dayOfWeek: number) => addDaysKey(gw.monday, dayOfWeek) >= vandaag
    if (![0, 1, 2, 3, 4, 5, 6].some(nogNietVoorbij)) continue
    const lid = lidPerMaandag.get(gw.monday) ?? null
    const verwijderen = (lid?.items ?? [])
      .filter(it => it.groupId === groupId && !it.gelogd && nogNietVoorbij(it.dayOfWeek))
      .map(it => it.id)
    const dagenAlGelogd = new Set((lid?.items ?? []).filter(it => it.groupId === groupId && it.gelogd).map(it => it.dayOfWeek))
    const kopieren = gw.days
      .filter(d => nogNietVoorbij(d.dayOfWeek) && !dagenAlGelogd.has(d.dayOfWeek))
      .flatMap(d => d.items.filter(it => !it.leeg).map(it => ({ bronItemId: it.id, dayOfWeek: d.dayOfWeek })))
    stappen.push({ monday: gw.monday, lidWeekId: lid?.id ?? null, verwijderen, kopieren })
  }
  return stappen
}
