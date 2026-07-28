/**
 * Ziet een hartslagmeting er onmogelijk uit?
 *
 * Een borstband of polssensor meet soms onzin: een natte band, kou, of een
 * cadanssensor die de trapfrequentie voor hartslag aanziet. Eén zo'n sessie
 * vervuilt de zoneverdeling én — via `rpeFromHeartRate` — de belasting.
 *
 * Dit signaleert alleen; het corrigeert niets. Er wordt nooit een hartslag
 * verzonnen: de gebruiker kiest zelf of hij de meting laat negeren. Zie
 * `wearables.dismissHeartRate`.
 *
 * Bewust conservatief. Een vals alarm ondermijnt het vertrouwen in de meting
 * die wél klopte, dus alleen wat fysiologisch niet kán of praktisch niet
 * voorkomt telt mee. Een echt zware intervalsessie mag geen vlag krijgen.
 */

/** Boven deze fractie van de max-HR is een sessie-GEMIDDELDE niet vol te houden. */
const IMPLAUSIBLE_AVG_FRACTION = 0.95

/** Buiten dit bereik bestaat een menselijke hartslag niet (de ingest klemt al op 30-240). */
const HUMAN_MIN_BPM = 35
const HUMAN_MAX_BPM = 235

export type HeartRateSample = {
  avgHeartRate?: number | null
  maxHeartRate?: number | null
}

/**
 * `profileMaxHr` is de max-hartslag van deze persoon (gemeten of uit leeftijd).
 * Ontbreekt die, dan vervallen de op de max gebaseerde regels en blijft alleen
 * de interne tegenstrijdigheid over.
 */
export function heartRateLooksImplausible(
  sample: HeartRateSample,
  profileMaxHr?: number | null,
): boolean {
  const avg = sample.avgHeartRate ?? null
  const max = sample.maxHeartRate ?? null
  if (avg == null && max == null) return false

  // 1. Buiten het menselijke bereik.
  for (const v of [avg, max]) {
    if (v != null && (v < HUMAN_MIN_BPM || v > HUMAN_MAX_BPM)) return true
  }

  // 2. Intern tegenstrijdig: een gemiddelde kan niet boven de piek liggen.
  //    Heeft geen profiel nodig, dus dit werkt altijd.
  if (avg != null && max != null && avg > max) return true

  if (profileMaxHr == null || profileMaxHr <= 0) return false

  // 3. Piek boven de eigen max is op zichzelf niet raar (de schatting uit
  //    leeftijd zit er vaak naast), maar een GEMIDDELDE op 95% van de max hou
  //    je geen hele sessie vol. Dat is het klassieke cadans-artefact.
  if (avg != null && avg > profileMaxHr * IMPLAUSIBLE_AVG_FRACTION) return true

  return false
}
