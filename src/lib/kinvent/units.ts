/**
 * Eenheden uit Kinvent.
 *
 * Wat vastligt sinds Kinvents documentatie van september 2026:
 *
 *   - Krachttests (K-Pull, K-Grip, IMTP, Nordic) komen in kilogramkracht.
 *   - Het sprongmodel (`_resultsModels`) komt in Newton, met de massa in kg
 *     ernaast als `mass` en het gewicht in N als `weight`. Die twee horen
 *     zich te verhouden als 9,81 (Kinvent rekent met g = 9,81). Op alle 454
 *     praktijksprongen was dat exact zo.
 *   - Kinvent legt zelf het lichaamsgewicht vast: de "Body weight"-variant van
 *     TOTAL_EVALUATION, 36 keer in onze praktijkdata. BASE hoeft dus geen
 *     eigen gewicht te kennen; de vorige Kinvent-meting is het ijkpunt.
 *
 * Wat nog niet zwart op wit staat: of de kg/lbs-instelling in de KINVENT-app
 * ook de API beïnvloedt. De documentatie noemt die instelling nergens, dus
 * waarschijnlijk is het alleen weergave. Tot Kinvent dat bevestigt houden we
 * drie controles aan, en importeren we bij twijfel niet stil:
 *
 *   1. Zwaartekracht. `weight / mass` in het sprongmodel moet 9,81 zijn.
 *      Elke andere verhouding betekent een andere eenheid in het model.
 *   2. Plausibiliteit. Een volwassene weegt tussen ongeveer 25 en 250 kg.
 *      Komt er 650 terug, dan is dat Newton.
 *   3. Sprong ten opzichte van de vorige gewichtsmeting van dezelfde patiënt.
 *      Iemand wordt tussen twee metingen niet 2,2 keer zwaarder; die factor
 *      is de omschakeling van kilogram naar ponden.
 *
 * Een meting die de controle niet haalt gaat met een waarschuwing naar de
 * therapeut in plaats van stil in het dossier te belanden met waarden die een
 * factor 2,2 of 9,8 verkeerd staan.
 */

/** Standaardzwaartekracht. 1 kgf = 9,80665 N. */
export const G = 9.80665

/** De g waarmee Kinvent zelf rekent; `weight / mass` in het sprongmodel. */
const KINVENT_G = 9.81
const GRAVITY_TOLERANCE = 0.02

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
 * `previousWeight` het gewicht uit de vorige Kinvent-meting van dezelfde
 *                  patiënt, als die er is.
 * `gravityRatio`   `weight / mass` uit het sprongmodel, als het een sprong is.
 *
 * `ok`          plausibel, en in lijn met de vorige meting.
 * `unverified`  geen gewicht in de meting (krachttests dragen er geen).
 *               Behandel als kg, maar laat de therapeut bevestigen.
 * `suspect`     onwaarschijnlijk gewicht, of een sprong ten opzichte van de
 *               vorige keer die geen mens maakt. Niet automatisch importeren.
 */
export function checkUnit(
  kinventWeight: number | null,
  previousWeight: number | null = null,
  gravityRatio: number | null = null,
): UnitCheck {
  if (gravityRatio !== null && Math.abs(gravityRatio - KINVENT_G) > KINVENT_G * GRAVITY_TOLERANCE) {
    return {
      status: 'suspect',
      unit: 'kg',
      ratio: gravityRatio,
      reason:
        `Gewicht gedeeld door massa is ${gravityRatio.toFixed(2)} in plaats van 9,81. ` +
        'Het sprongmodel staat dan niet in Newton en kilogram.',
    }
  }
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

/**
 * Eén decimaal voor het dossier. Kinvent levert tien decimalen; in een
 * invoerveld leest dat als ruis en het suggereert een precisie die een
 * krachtplaat niet heeft.
 */
export function rond(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10
}

/** Limb Symmetry Index: de zwakste zijde als percentage van de sterkste. */
export function lsi(left: number | null, right: number | null): number | null {
  if (!left || !right) return null
  const [min, max] = left < right ? [left, right] : [right, left]
  if (max === 0) return null
  return (min / max) * 100
}
