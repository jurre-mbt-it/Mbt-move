/**
 * Eenheden uit Kinvent.
 *
 * Kinvent levert krachten in kilogram. Dat is niet uit hun documentatie
 * gehaald maar gemeten op 261 sprongen uit onze eigen praktijk: het
 * lichaamsgewicht had een mediaan van 65,6 met een spreiding van 46,9 tot
 * 123,2, en de piekkracht gedeeld door dat gewicht een mediaan van 2,28 met
 * alles tussen 1,74 en 6,60. Stonden de krachten in Newton en het gewicht in
 * kg, dan lag die verhouding rond 22. Er zit geen enkele meting in dat gebied.
 *
 * Het probleem: de eenheid is in de KINVENT-app per gebruiker om te zetten en
 * staat nergens in de respons. De schakelaar zet gewicht én kracht tegelijk om,
 * dus aan de verhouding kracht/gewicht is een omzetting niet te zien.
 *
 * De voor de hand liggende controle, het gewicht uit Kinvent naast dat uit
 * BASE leggen, kan niet: BASE legt het lichaamsgewicht van een patiënt nergens
 * vast. Wat overblijft zijn twee controles die wél werken:
 *
 *   1. Plausibiliteit. Een volwassene weegt tussen ongeveer 25 en 250 kg. Komt
 *      er 650 terug, dan staat de app op Newton.
 *   2. Sprong ten opzichte van de vorige meting van dezelfde patiënt. Iemand
 *      wordt tussen twee metingen niet 2,2 keer zwaarder; die factor is de
 *      omschakeling van kilogram naar ponden.
 *
 * Ponden zijn met alleen controle 1 niet te betrappen (145 lb is 66 kg, en
 * allebei zijn plausibel). Daarom is controle 2 de belangrijkste, en daarom
 * bewaren we `bodyWeightKg` bij elke sprongmeting: die reeks ís het ijkpunt.
 *
 * We importeren nooit blind. Een meting die de controle niet haalt gaat met een
 * waarschuwing naar de therapeut in plaats van stil in het dossier te belanden
 * met waarden die een factor 2,2 of 9,8 verkeerd staan.
 */

/** Standaardzwaartekracht. 1 kgf = 9,80665 N. */
export const G = 9.80665

/** Een volwassene valt hierbinnen. Daarbuiten is het geen kilogrammen. */
const PLAUSIBLE_KG = { min: 25, max: 250 }

/** Groeispurten en gewichtsverlies blijven hieronder; een eenheidswissel niet. */
const DRIFT_TOLERANCE = 0.15

export type UnitCheck =
  | { status: 'ok'; unit: 'kg' }
  | { status: 'unverified'; unit: 'kg'; reason: string }
  | { status: 'suspect'; unit: 'kg'; reason: string; ratio: number | null }

/**
 * Toetst of een meting werkelijk in kilogram staat.
 *
 * `kinventWeight`  het lichaamsgewicht uit deze meting.
 * `previousWeight` het gewicht uit de vorige geïmporteerde meting van dezelfde
 *                  patiënt, als die er is.
 *
 * `ok`          plausibel, en in lijn met de vorige meting.
 * `unverified`  geen gewicht in de meting (krachttests dragen er geen).
 *               Behandel als kg, maar laat de therapeut bevestigen.
 * `suspect`     onwaarschijnlijk gewicht, of een sprong ten opzichte van de
 *               vorige keer die geen mens maakt. Niet automatisch importeren.
 */
export function checkUnit(kinventWeight: number | null, previousWeight: number | null = null): UnitCheck {
  if (!kinventWeight) {
    return { status: 'unverified', unit: 'kg', reason: 'Deze meting draagt geen lichaamsgewicht.' }
  }
  if (kinventWeight < PLAUSIBLE_KG.min || kinventWeight > PLAUSIBLE_KG.max) {
    const hint = kinventWeight > 400 ? ' Dat wijst op Newton in de KINVENT-app.' : ''
    return {
      status: 'suspect',
      unit: 'kg',
      ratio: null,
      reason: `Kinvent meldt ${kinventWeight.toFixed(1)} als lichaamsgewicht.${hint}`,
    }
  }
  if (previousWeight && previousWeight > 0) {
    const ratio = kinventWeight / previousWeight
    if (Math.abs(ratio - 1) > DRIFT_TOLERANCE) {
      const hint =
        ratio > 1.9 && ratio < 2.5
          ? ' Dat is precies de omrekening van kilogram naar ponden.'
          : ratio > 0.4 && ratio < 0.53
            ? ' Dat is precies de omrekening van ponden terug naar kilogram.'
            : ''
      return {
        status: 'suspect',
        unit: 'kg',
        ratio,
        reason:
          `Lichaamsgewicht ging van ${previousWeight.toFixed(1)} naar ` +
          `${kinventWeight.toFixed(1)} sinds de vorige meting.${hint}`,
      }
    }
  }
  return { status: 'ok', unit: 'kg' }
}

/**
 * Kilogramkracht naar Newton.
 *
 * Alleen nodig voor `RehabCriterion`, waar de drempels (`newtonMinGreen`,
 * `newtonMinOrange`) in Newton staan. Testrapporten hebben een `unitPrimary`
 * die kg al aankan en blijven dus gewoon in kg: elke omrekening die je niet
 * doet, kun je ook niet verkeerd doen.
 */
export function kgToNewton(kg: number): number {
  return kg * G
}

/** Limb Symmetry Index: de zwakste zijde als percentage van de sterkste. */
export function lsi(left: number | null, right: number | null): number | null {
  if (!left || !right) return null
  const [min, max] = left < right ? [left, right] : [right, left]
  if (max === 0) return null
  return (min / max) * 100
}
