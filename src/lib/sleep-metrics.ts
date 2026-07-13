/**
 * Slaap-metrieken — afgeleid uit HealthKit sleep-analysis-segmenten.
 *
 * Stages komen uit watchOS als losse category-samples (asleepCore/Deep/REM,
 * awake, inBed). We aggregeren ze tot één nacht en berekenen een transparante
 * 0-100 kwaliteitsscore in Fitbit-stijl (de enige publiek-gedocumenteerde
 * weging): 50% slaapduur-vs-behoefte, 25% herstellende slaap (deep+REM),
 * 25% efficiëntie. Stage-percentages van consumer-wearables zijn ruis op één
 * nacht maar betrouwbaar als trend — toon dus altijd meerdaagse context.
 *
 * Puur (geen deps) zodat client en server dezelfde wiskunde delen.
 */

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem' | 'inBed'

/** Eén ruw segment uit HealthKit (ISO-strings). */
export type SleepSegment = {
  stage: SleepStage
  startAt: string
  endAt: string
}

export type SleepNight = {
  asleepMin: number
  lightMin: number
  deepMin: number
  remMin: number
  awakeMin: number
  inBedMin: number | null
  efficiency: number | null // 0-1
  latencyMin: number | null
}

/** Aanbevolen slaapbehoefte voor volwassenen (min). 8u = midden 7-9u. */
export const SLEEP_NEED_MIN = 480

/**
 * Persoonlijke slaapbehoefte (min) uit de eigen historie: het p75 van de
 * laatste ≤30 nachten. p75 i.p.v. gemiddelde zodat een reeks korte nachten de
 * "behoefte" niet omlaag trekt — het schat wat iemand slaapt als hij de kans
 * krijgt. Geclampt op 6-9u: de baseline mag nooit afglijden naar "4 uur is
 * jouw norm" (chronisch tekort voelt went, maar herstel blijft objectief
 * achter). Onder de 7 nachten historie vallen we terug op de populatienorm.
 *
 * Waarom: wie structureel korter slaapt dan 8u zat anders élke dag in het
 * rood op de duur-component — readiness moet afwijking van je eigen normaal
 * meten, niet je levensstijl elke ochtend opnieuw veroordelen.
 */
export const SLEEP_NEED_FLOOR_MIN = 360
export const SLEEP_NEED_CEIL_MIN = 540

export function personalSleepNeed(asleepMins: number[]): number {
  const valid = asleepMins.filter(m => m > 0).slice(-30)
  if (valid.length < 7) return SLEEP_NEED_MIN
  const sorted = [...valid].sort((a, b) => a - b)
  const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]
  return Math.round(Math.max(SLEEP_NEED_FLOOR_MIN, Math.min(SLEEP_NEED_CEIL_MIN, p75)))
}

/**
 * Slaapschuld (min) over de laatste ≤7 nachten: som van de tekorten t.o.v.
 * de (persoonlijke) behoefte. Langere nachten lossen geen schuld af — surplus
 * telt niet negatief; drie keer "net iets te kort" stapelt wél, wat losse
 * nachtscores missen.
 */
export function sleepDebtMin(nights: { asleepMin: number }[], needMin: number): number {
  return Math.round(
    nights
      .slice(-7)
      .reduce((sum, n) => sum + Math.max(0, needMin - n.asleepMin), 0),
  )
}

/**
 * Aggregeer ruwe segmenten tot één nacht. `inBed`-segmenten bepalen de
 * tijd-in-bed (voor efficiëntie); asleep-stages tellen op tot de slaaptijd.
 * Latency = tijd tussen eerste in-bed en eerste slaap-segment.
 */
export function aggregateNight(segments: SleepSegment[]): SleepNight {
  let light = 0
  let deep = 0
  let rem = 0
  let awake = 0
  let inBed = 0

  const min = (s: SleepSegment) =>
    Math.max(0, (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000)

  for (const s of segments) {
    const m = min(s)
    switch (s.stage) {
      case 'light': light += m; break
      case 'deep': deep += m; break
      case 'rem': rem += m; break
      case 'awake': awake += m; break
      case 'inBed': inBed += m; break
    }
  }

  const asleep = light + deep + rem
  // Tijd in bed: expliciet inBed-segment indien aanwezig, anders asleep+awake.
  const timeInBed = inBed > 0 ? inBed : asleep + awake
  const efficiency = timeInBed > 0 ? clamp01(asleep / timeInBed) : null

  // Latency: eerste asleep-start minus eerste in-bed/segment-start.
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )
  const firstStart = sorted[0] ? new Date(sorted[0].startAt).getTime() : null
  const firstAsleep = sorted.find(s => s.stage === 'light' || s.stage === 'deep' || s.stage === 'rem')
  const latencyMin =
    firstStart != null && firstAsleep
      ? Math.max(0, Math.round((new Date(firstAsleep.startAt).getTime() - firstStart) / 60000))
      : null

  return {
    asleepMin: Math.round(asleep),
    lightMin: Math.round(light),
    deepMin: Math.round(deep),
    remMin: Math.round(rem),
    awakeMin: Math.round(awake),
    inBedMin: timeInBed > 0 ? Math.round(timeInBed) : null,
    efficiency,
    latencyMin,
  }
}

/**
 * Transparante 0-100 slaap-kwaliteitsscore (Fitbit-weging).
 *  - 50 pt: slaapduur t.o.v. behoefte (cap op behoefte; korter = lineair minder)
 *  - 25 pt: herstellende slaap = (deep+REM)/asleep t.o.v. ideaal ~0.43
 *           (deep 13-23% + REM 20-25% ≈ gezonde nacht)
 *  - 25 pt: efficiëntie (asleep/inBed), 0.85+ = vol, <0.5 = 0
 *
 * `needMin` default = populatienorm (8u). De opgeslagen score (ingest) blijft
 * absoluut — die verschuift niet als de baseline verschuift; readiness
 * herberekent bij het lezen met `personalSleepNeed` zodat structurele korte
 * slapers op hun eigen normaal worden beoordeeld.
 */
export function sleepQualityScore(
  n: Pick<SleepNight, 'asleepMin' | 'deepMin' | 'remMin' | 'efficiency'>,
  needMin: number = SLEEP_NEED_MIN,
): number {
  const durationPts = 50 * clamp01(n.asleepMin / needMin)

  const restorativeShare = n.asleepMin > 0 ? (n.deepMin + n.remMin) / n.asleepMin : 0
  const IDEAL_RESTORATIVE = 0.43
  // Vol punten bij ideaal of hoger; lineair terug naar 0 bij 0% herstellend.
  const restorativePts = 25 * clamp01(restorativeShare / IDEAL_RESTORATIVE)

  const eff = n.efficiency ?? 0
  // 0.85+ = vol; onder 0.5 = 0; lineair daartussen.
  const efficiencyPts = 25 * clamp01((eff - 0.5) / (0.85 - 0.5))

  return Math.round(durationPts + restorativePts + efficiencyPts)
}

/** Label-band voor een 0-100 slaapscore. */
export function sleepBand(score: number): { key: 'good' | 'fair' | 'poor'; label: string } {
  if (score >= 80) return { key: 'good', label: 'Goed' }
  if (score >= 60) return { key: 'fair', label: 'Redelijk' }
  return { key: 'poor', label: 'Matig' }
}

/**
 * Slaapconsistentie (Whoop-stijl, 0-100): hoe stabiel zijn bedtijd en
 * ontwaaktijd over de laatste nachten. We nemen de spreiding (SD in minuten)
 * van inslaap- en ontwaakmomenten en mappen die naar 0-100 (≤15 min SD = 100,
 * ≥120 min SD = 0). Vereist ≥3 nachten.
 */
export function sleepConsistency(
  nights: { startAt: string; endAt: string }[],
): number | null {
  if (nights.length < 3) return null

  // Minuten-op-de-klok (0-1439), circulair gemiddelde via sin/cos.
  const minuteOfDay = (iso: string) => {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes()
  }
  const circularSd = (mins: number[]): number => {
    const ang = mins.map(m => (m / 1440) * 2 * Math.PI)
    const s = ang.reduce((a, x) => a + Math.sin(x), 0) / ang.length
    const c = ang.reduce((a, x) => a + Math.cos(x), 0) / ang.length
    const r = Math.sqrt(s * s + c * c)
    // Circulaire SD (radialen) → minuten.
    const sdRad = Math.sqrt(-2 * Math.log(Math.max(r, 1e-9)))
    return (sdRad / (2 * Math.PI)) * 1440
  }

  const bedSd = circularSd(nights.map(n => minuteOfDay(n.startAt)))
  const wakeSd = circularSd(nights.map(n => minuteOfDay(n.endAt)))
  const avgSd = (bedSd + wakeSd) / 2

  const score = 100 * clamp01((120 - avgSd) / (120 - 15))
  return Math.round(score)
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
