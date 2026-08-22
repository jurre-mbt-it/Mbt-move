/**
 * Readiness v2 — hybride herstel-score uit wearable-signalen, met de
 * subjectieve wellness-check als neerwaartse override.
 *
 * Onderbouwing (zie research): de nachtelijke HRV-trend t.o.v. een eigen
 * baseline is het sterkst gevalideerde autonome herstel-signaal, aangevuld
 * met rust-HR-afwijking, slaapkwaliteit, ademfrequentie (ziekte-vlag) en
 * pols-temperatuur-afwijking. Absolute HRV is NOOIT tussen personen of
 * devices vergelijkbaar (Apple meet SDNN, anderen RMSSD) — daarom werken we
 * uitsluitend met afwijking t.o.v. de persoonlijke baseline, en log-
 * transformeren we RMSSD/SDNN (lnHRV) omdat de variantie meeschaalt met de
 * grootte (Plews 2013).
 *
 * Rehab-context: de score is een GATE, geen autopilot. Een slechte
 * subjectieve wellness-check (pijn/stijfheid/vermoeidheid) kan de score
 * omlaag trekken maar een goede check kan een slechte fysiologie niet
 * oppoetsen — vandaar `min(physio, blend)`.
 *
 * Puur (geen deps) zodat client en server dezelfde wiskunde delen.
 */

/** Eén dag fysiologische metingen. `date` = 'yyyy-mm-dd'. */
export type VitalsDay = {
  date: string
  hrv: number | null // ms (SDNN of RMSSD)
  restingHeartRate: number | null
  respiratoryRate: number | null
  wristTempDeviation: number | null // °C afwijking van baseline
}

/** Eén nacht slaapscore. `date` = 'yyyy-mm-dd'. */
export type SleepDay = { date: string; qualityScore: number | null }

/** Subjectieve wellness-check (1-5 sliders, 5 = best). */
export type WellnessToday = {
  sleep: number
  soreness: number
  fatigue: number
  mood: number
  stress: number
} | null

export type ContributorStatus = 'above' | 'within' | 'below' | 'na'

/**
 * Taal van de teksten die dit bestand teruggeeft (label, description,
 * narrative, contributor-labels). Geen i18next hier: het bestand is bewust
 * dependency-vrij zodat client en server dezelfde wiskunde delen. De caller
 * geeft de taal van de lézer mee; de web-app blijft Nederlands.
 */
export type ReadinessLocale = 'nl' | 'en'

type ReadinessText = {
  contributor: Record<'hrv' | 'rhr' | 'respiratory' | 'wristTemp' | 'sleep' | 'wellness', string>
  learningLabel: string
  learning: (nights: number) => string
  bands: Record<'green' | 'amber' | 'red' | 'illness', { label: string; description: string }>
  narrative: {
    sameAs: (baseline: number) => string
    deviation: (pct: number, higher: boolean, baseline: number) => string
    hrvPart: (value: number, dev: string) => string
    rhrPart: (value: number, dev: string) => string
    lead: (parts: string) => string
    join: string
    fallback: string
    respiratory: (value: number, higher: boolean, baseline: number) => string
    illness: string
  }
}

const TEXT: Record<ReadinessLocale, ReadinessText> = {
  nl: {
    contributor: {
      hrv: 'HRV',
      rhr: 'Rust-HR',
      respiratory: 'Ademhaling',
      wristTemp: 'Huidtemp.',
      sleep: 'Slaap',
      wellness: 'Welzijn',
    },
    learningLabel: 'Baseline leren',
    learning: (n: number) =>
      `Nog ${n} ${n === 1 ? 'nacht' : 'nachten'} te gaan voordat je readiness betrouwbaar is. Draag je watch \u2019s nachts om je persoonlijke normaal op te bouwen.`,
    bands: {
      green: {
        label: 'Klaar om te trainen',
        description:
          'Je herstel-signalen zitten op of boven je normaal. Een goed moment voor je geplande opbouw of een zwaardere sessie.',
      },
      amber: {
        label: 'Onderhoud',
        description:
          'Enkele signalen zitten onder je normaal. Train op onderhoudsniveau, houd intensiteit gelijk en let op techniek en mobiliteit.',
      },
      red: {
        label: 'Herstel aanbevolen',
        description:
          'Meerdere signalen zitten duidelijk onder je normaal. Plan actief herstel of een deload en bouw belasting pas weer op als je readiness herstelt.',
      },
      illness: {
        label: 'Mogelijk ziek, rust',
        description:
          'Verhoogde ademhaling \u00e9n temperatuur-afwijking wijzen op een mogelijke infectie. Kies voor rust of licht actief herstel en overleg met je therapeut.',
      },
    },
    narrative: {
      sameAs: (baseline: number) => `gelijk aan je gemiddelde van ${baseline}`,
      deviation: (pct: number, higher: boolean, baseline: number) =>
        `${pct}% ${higher ? 'hoger' : 'lager'} dan je gemiddelde van ${baseline}`,
      hrvPart: (value: number, dev: string) => `je HRV tijdens de slaap van ${value} ms (${dev} ms)`,
      rhrPart: (value: number, dev: string) => `een rust-hartslag van ${value} bpm (${dev} bpm)`,
      lead: (parts: string) => `Je herstelscore is vooral gebaseerd op ${parts}.`,
      join: ' en ',
      fallback:
        'Je herstelscore is gebaseerd op je HRV, rust-hartslag en slaap. Zodra je watch meer nachten heeft gemeten, wordt deze uitleg specifieker.',
      respiratory: (value: number, higher: boolean, baseline: number) =>
        ` Je ademhaling ligt met ${value}/min ${higher ? 'hoger' : 'lager'} dan je normaal van ${baseline}/min.`,
      illness: ' Let op: een verhoogde ademhaling \u00e9n huidtemperatuur kunnen op een opkomende infectie wijzen.',
    },
  },
  en: {
    contributor: {
      hrv: 'HRV',
      rhr: 'Resting HR',
      respiratory: 'Breathing',
      wristTemp: 'Skin temp.',
      sleep: 'Sleep',
      wellness: 'Wellbeing',
    },
    learningLabel: 'Learning your baseline',
    learning: (n: number) =>
      `${n} more ${n === 1 ? 'night' : 'nights'} to go before your readiness is reliable. Wear your watch at night to build up your personal normal.`,
    bands: {
      green: {
        label: 'Ready to train',
        description:
          'Your recovery signals are at or above your normal. A good moment for your planned build-up or a harder session.',
      },
      amber: {
        label: 'Maintain',
        description:
          'Some signals are below your normal. Train at maintenance level, keep the intensity the same and watch your technique and mobility.',
      },
      red: {
        label: 'Recovery advised',
        description:
          'Several signals are clearly below your normal. Plan active recovery or a deload, and build load back up once your readiness recovers.',
      },
      illness: {
        label: 'Possibly ill, rest',
        description:
          'A raised breathing rate and a temperature deviation point to a possible infection. Choose rest or light active recovery and check in with your therapist.',
      },
    },
    narrative: {
      sameAs: (baseline: number) => `the same as your average of ${baseline}`,
      deviation: (pct: number, higher: boolean, baseline: number) =>
        `${pct}% ${higher ? 'higher' : 'lower'} than your average of ${baseline}`,
      hrvPart: (value: number, dev: string) => `your HRV during sleep of ${value} ms (${dev} ms)`,
      rhrPart: (value: number, dev: string) => `a resting heart rate of ${value} bpm (${dev} bpm)`,
      lead: (parts: string) => `Your recovery score is mainly based on ${parts}.`,
      join: ' and ',
      fallback:
        'Your recovery score is based on your HRV, resting heart rate and sleep. Once your watch has measured more nights, this explanation gets more specific.',
      respiratory: (value: number, higher: boolean, baseline: number) =>
        ` Your breathing rate is ${value}/min, ${higher ? 'higher' : 'lower'} than your usual ${baseline}/min.`,
      illness: ' Note: a raised breathing rate together with a raised skin temperature can point to an infection coming on.',
    },
  },
}

export type Contributor = {
  key: 'hrv' | 'rhr' | 'sleep' | 'respiratory' | 'wristTemp' | 'wellness'
  label: string
  status: ContributorStatus
  /** Gemeten waarde (voor weergave), of null. */
  value: number | null
  /** Baseline waar tegen vergeleken wordt, of null. */
  baseline: number | null
  /** 0-100 deelscore, of null als geen data. */
  points: number | null
  /** Relatief gewicht binnen de beschikbare contributors. */
  weight: number
}

export type ReadinessBandKey = 'GREEN' | 'AMBER' | 'RED' | 'LEARNING'

export type ReadinessResult = {
  score: number | null // 0-100, null als LEARNING
  band: ReadinessBandKey
  label: string
  description: string
  /**
   * Data-gedreven uitleg-zin (Athlytic-stijl): benoemt de gemeten HRV/rust-HR
   * met de exacte afwijking t.o.v. de eigen baseline. Past zich aan de dag aan.
   */
  narrative: string
  contributors: Contributor[]
  /** Aantal nachten met bruikbare HRV-data dat de baseline voedt. */
  baselineNights: number
  /** Mogelijke ziekte-vlag (resp. + temp tegelijk afwijkend). */
  illnessFlag: boolean
}

const MIN_BASELINE_NIGHTS = 7 // < dit ⇒ LEARNING
const BASELINE_WINDOW = 7 // rollend gemiddelde (dagen, excl. vandaag)
const NORMAL_WINDOW = 60 // venster voor de SD / "normale band"

// Relatieve gewichten; genormaliseerd over de beschikbare contributors.
const WEIGHTS = {
  hrv: 0.35,
  sleep: 0.3,
  rhr: 0.2,
  respiratory: 0.1,
  wristTemp: 0.05,
} as const

/**
 * @param vitals  oplopend of aflopend; minstens enkele weken historie wenselijk.
 * @param sleep   slaapscores per nacht.
 * @param wellness vandaag's subjectieve check (of null).
 * @param today   'yyyy-mm-dd' van de te scoren dag (default: laatste vitals-dag).
 * @param locale  taal van de teksten (default Nederlands; de web-app laat 'm leeg).
 */
export function computeReadiness(
  vitals: VitalsDay[],
  sleep: SleepDay[],
  wellness: WellnessToday,
  today?: string,
  locale: ReadinessLocale = 'nl',
): ReadinessResult {
  const T = TEXT[locale] ?? TEXT.nl
  const byDateAsc = [...vitals].sort((a, b) => a.date.localeCompare(b.date))
  const targetDate = today ?? byDateAsc[byDateAsc.length - 1]?.date ?? null

  const hist = targetDate ? byDateAsc.filter(v => v.date <= targetDate) : byDateAsc
  const todayVitals = hist[hist.length - 1] ?? null
  const prior = hist.slice(0, -1) // baseline excludeert de te scoren dag

  // lnHRV-baseline + SD.
  const lnHrv = (v: number | null) => (v != null && v > 0 ? Math.log(v) : null)
  const priorLnHrv = prior
    .map(v => lnHrv(v.hrv))
    .filter((x): x is number => x != null)
  const baselineNights = priorLnHrv.length

  // --- HRV ---
  const recentLn = priorLnHrv.slice(-BASELINE_WINDOW)
  const hrvMean = mean(recentLn)
  const hrvSd = sd(priorLnHrv.slice(-NORMAL_WINDOW))
  const todayLn = lnHrv(todayVitals?.hrv ?? null)
  const hrv = contributorFromDeviation({
    key: 'hrv',
    label: T.contributor.hrv,
    today: todayLn,
    mean: hrvMean,
    sd: hrvSd,
    direction: 'higherBetter',
    sensitivity: 20,
    minSd: 0.1, // lnHRV: ~10% nacht-op-nacht is normale ruis, geen signaal
    rawValue: todayVitals?.hrv ?? null,
    rawBaseline: hrvMean != null ? Math.round(Math.exp(hrvMean)) : null,
    weight: WEIGHTS.hrv,
  })

  // --- Rust-HR (lager = beter) ---
  const priorRhr = prior.map(v => v.restingHeartRate).filter((x): x is number => x != null)
  const rhr = contributorFromDeviation({
    key: 'rhr',
    label: T.contributor.rhr,
    today: todayVitals?.restingHeartRate ?? null,
    mean: mean(priorRhr.slice(-BASELINE_WINDOW)),
    sd: sd(priorRhr.slice(-NORMAL_WINDOW)),
    direction: 'lowerBetter',
    sensitivity: 20,
    minSd: 3, // rust-HR: ±3 bpm dag-op-dag is normale meetruis
    rawValue: todayVitals?.restingHeartRate ?? null,
    rawBaseline: priorRhr.length ? Math.round(mean(priorRhr.slice(-BASELINE_WINDOW))!) : null,
    weight: WEIGHTS.rhr,
  })

  // --- Ademfrequentie (hoger = slechter; ziekte-vlag) ---
  const priorResp = prior.map(v => v.respiratoryRate).filter((x): x is number => x != null)
  const respiratory = contributorFromDeviation({
    key: 'respiratory',
    label: T.contributor.respiratory,
    today: todayVitals?.respiratoryRate ?? null,
    mean: mean(priorResp.slice(-BASELINE_WINDOW)),
    sd: sd(priorResp.slice(-NORMAL_WINDOW)),
    direction: 'lowerBetter',
    sensitivity: 15,
    minSd: 0.7, // ademhaling: ±0.7/min dag-op-dag is normale ruis
    rawValue: todayVitals?.respiratoryRate ?? null,
    rawBaseline: priorResp.length ? round1(mean(priorResp.slice(-BASELINE_WINDOW))!) : null,
    weight: WEIGHTS.respiratory,
  })

  // --- Pols-temperatuur-afwijking (absolute afwijking telt) ---
  const tempDev = todayVitals?.wristTempDeviation ?? null
  const wristTemp: Contributor = {
    key: 'wristTemp',
    label: T.contributor.wristTemp,
    value: tempDev,
    baseline: 0,
    weight: WEIGHTS.wristTemp,
    status: tempDev == null ? 'na' : Math.abs(tempDev) <= 0.3 ? 'within' : 'below',
    // Een normale huidtemp is neutraal (~70), geen boost naar 100 — anders duwt
    // 'ie de score kunstmatig omhoog. Alleen een afwijking (koorts/oververmoeid)
    // trekt de deelscore neer.
    points: tempDev == null ? null : clamp(70 - Math.abs(tempDev) * 70, 0, 100),
  }

  // --- Slaap (vorige nacht, t.o.v. eigen recent gemiddelde voor status) ---
  const sleepAsc = [...sleep].sort((a, b) => a.date.localeCompare(b.date))
  const sleepHist = targetDate ? sleepAsc.filter(s => s.date <= targetDate) : sleepAsc
  const lastSleep = sleepHist[sleepHist.length - 1]?.qualityScore ?? null
  const priorSleep = sleepHist
    .slice(0, -1)
    .map(s => s.qualityScore)
    .filter((x): x is number => x != null)
  const sleepMean = mean(priorSleep.slice(-BASELINE_WINDOW))
  const sleepContrib: Contributor = {
    key: 'sleep',
    label: T.contributor.sleep,
    value: lastSleep,
    baseline: sleepMean != null ? Math.round(sleepMean) : null,
    weight: WEIGHTS.sleep,
    points: lastSleep,
    status:
      lastSleep == null
        ? 'na'
        : sleepMean == null
          ? 'within'
          : lastSleep > sleepMean + 5
            ? 'above'
            : lastSleep < sleepMean - 5
              ? 'below'
              : 'within',
  }

  const physioContribs = [hrv, rhr, sleepContrib, respiratory, wristTemp]

  // --- LEARNING-gate ---
  if (baselineNights < MIN_BASELINE_NIGHTS) {
    const learningText = T.learning(MIN_BASELINE_NIGHTS - baselineNights)
    return {
      score: null,
      band: 'LEARNING',
      label: T.learningLabel,
      description: learningText,
      narrative: learningText,
      contributors: withWellness(physioContribs, wellness, T),
      baselineNights,
      illnessFlag: false,
    }
  }

  // --- Gewogen fysiologische score over beschikbare contributors ---
  const avail = physioContribs.filter(c => c.points != null)
  const wSum = avail.reduce((a, c) => a + c.weight, 0) || 1
  const physio = Math.round(avail.reduce((a, c) => a + (c.points ?? 0) * c.weight, 0) / wSum)

  // --- Wellness als neerwaartse override ---
  const wellnessContrib = wellnessContributor(wellness, T)
  let score = physio
  if (wellnessContrib.points != null) {
    const blend = Math.round(physio * 0.65 + wellnessContrib.points * 0.35)
    score = Math.min(physio, blend) // wellness kan alleen omlaag trekken
  }

  // --- Ziekte-vlag: ademhaling + temp samen afwijkend ---
  // Op RUWE drempels, niet op de variantie-afhankelijke deelscores: de
  // literatuur noemt een aanhoudende +3 ademhalingen/min boven baseline samen
  // met een temperatuur-afwijking als vroege infectie-indicator.
  const respBaseline = respiratory.baseline
  const respElevated =
    todayVitals?.respiratoryRate != null &&
    respBaseline != null &&
    todayVitals.respiratoryRate - respBaseline >= 3
  const tempElevated = tempDev != null && Math.abs(tempDev) >= 0.8
  const illnessFlag = respElevated && tempElevated

  let band = bandFromScore(score)
  if (illnessFlag && band !== 'RED') band = 'RED'

  const meta = bandMeta(band, illnessFlag, T)
  return {
    score,
    band,
    label: meta.label,
    description: meta.description,
    narrative: buildNarrative(physioContribs, illnessFlag, T),
    contributors: [...physioContribs, wellnessContrib],
    baselineNights,
    illnessFlag,
  }
}

// ── helpers ──────────────────────────────────────────────

function contributorFromDeviation(args: {
  key: Contributor['key']
  label: string
  today: number | null
  mean: number | null
  sd: number | null
  direction: 'higherBetter' | 'lowerBetter'
  sensitivity: number // punten per SD-afwijking
  /**
   * Ondergrens voor de SD. Bij een héél stabiele reeks wordt de gemeten SD
   * minuscuul, waardoor triviale nachtelijke ruis een enorme z-score geeft en
   * de deelscore verzadigt op 0 of 100 (precies waarom readiness "altijd >90"
   * bleef). De vloer houdt de score genuanceerd i.p.v. bimodaal.
   */
  minSd: number
  rawValue: number | null
  rawBaseline: number | null
  weight: number
}): Contributor {
  const { today, mean: m, sd: s, direction, sensitivity, minSd } = args
  if (today == null || m == null) {
    return {
      key: args.key, label: args.label, value: args.rawValue, baseline: args.rawBaseline,
      weight: args.weight, status: 'na', points: null,
    }
  }
  const sdv = Math.max(s ?? 0, minSd)
  const z = sdv > 0 ? (today - m) / sdv : 0
  const signed = direction === 'higherBetter' ? z : -z
  const points = clamp(50 + signed * sensitivity, 0, 100)
  const status: ContributorStatus =
    Math.abs(z) <= 0.5 ? 'within' : signed > 0 ? 'above' : 'below'
  return {
    key: args.key, label: args.label, value: args.rawValue, baseline: args.rawBaseline,
    weight: args.weight, status, points: Math.round(points),
  }
}

function wellnessContributor(w: WellnessToday, T: ReadinessText): Contributor {
  if (!w) {
    return { key: 'wellness', label: T.contributor.wellness, value: null, baseline: null, weight: 0, status: 'na', points: null }
  }
  const total = w.sleep + w.soreness + w.fatigue + w.mood + w.stress // 5-25
  const pct = Math.round(((total - 5) / 20) * 100)
  return {
    key: 'wellness',
    label: T.contributor.wellness,
    value: pct,
    baseline: null,
    weight: 0, // telt niet mee in de fysio-som; werkt als override
    status: pct >= 70 ? 'above' : pct >= 45 ? 'within' : 'below',
    points: pct,
  }
}

function withWellness(contribs: Contributor[], w: WellnessToday, T: ReadinessText): Contributor[] {
  return [...contribs, wellnessContributor(w, T)]
}

/** Procentuele afwijking van een waarde t.o.v. baseline (afgerond). */
function pctDiff(value: number, baseline: number): number {
  if (!baseline) return 0
  return Math.round(((value - baseline) / baseline) * 100)
}

/**
 * Bouwt de data-gedreven uitleg-zin uit de contributors: benoemt HRV en rust-HR
 * met hun exacte afwijking t.o.v. de eigen baseline (Athlytic-stijl), en voegt
 * ademhaling/ziekte-signaal alleen toe als die duidelijk afwijken.
 */
function buildNarrative(contribs: Contributor[], illness: boolean, T: ReadinessText): string {
  const by = (k: Contributor['key']) => contribs.find(c => c.key === k)
  const deviation = (c: Contributor | undefined): string | null => {
    if (!c || c.value == null || c.baseline == null) return null
    const p = pctDiff(c.value, c.baseline)
    if (p === 0) return T.narrative.sameAs(c.baseline)
    return T.narrative.deviation(Math.abs(p), p > 0, c.baseline)
  }

  const parts: string[] = []
  const hrv = by('hrv')
  const hrvDev = deviation(hrv)
  if (hrv?.value != null && hrvDev) parts.push(T.narrative.hrvPart(hrv.value, hrvDev))

  const rhr = by('rhr')
  const rhrDev = deviation(rhr)
  if (rhr?.value != null && rhrDev) parts.push(T.narrative.rhrPart(rhr.value, rhrDev))

  let s = parts.length === 0 ? T.narrative.fallback : T.narrative.lead(parts.join(T.narrative.join))

  // Ademhaling alleen noemen als ze duidelijk afwijkt (≥1/min).
  const resp = by('respiratory')
  if (resp?.value != null && resp.baseline != null && Math.abs(resp.value - resp.baseline) >= 1) {
    const p = pctDiff(resp.value, resp.baseline)
    s += T.narrative.respiratory(resp.value, p > 0, resp.baseline)
  }
  if (illness) {
    s += T.narrative.illness
  }
  return s
}

function bandFromScore(score: number): ReadinessBandKey {
  if (score >= 67) return 'GREEN'
  if (score >= 34) return 'AMBER'
  return 'RED'
}

function bandMeta(
  band: ReadinessBandKey,
  illness: boolean,
  T: ReadinessText,
): { label: string; description: string } {
  switch (band) {
    case 'GREEN':
      return { ...T.bands.green }
    case 'AMBER':
      return { ...T.bands.amber }
    case 'RED':
      return illness ? { ...T.bands.illness } : { ...T.bands.red }
    default:
      return { label: T.learningLabel, description: '' }
  }
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null
  return xs.reduce((a, x) => a + x, 0) / xs.length
}

function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)!
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
