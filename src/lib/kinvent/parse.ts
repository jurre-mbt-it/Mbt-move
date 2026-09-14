/**
 * `ActivityAnalysisResult.activityResults` uitlezen.
 *
 * Kinvent levert dit als stringified JSON. De vorm per activity type staat in
 * hun "Analysis response reference" (september 2026); de kopie ligt in
 * ~/kinvent-koppeling/docs-2026-09/. Alles hieronder is defensief: onbekende
 * vormen leveren `null` op in plaats van een half ingevulde meting.
 *
 * Drie dingen die uit die referentie en uit eigen praktijkdata kwamen:
 *
 *   - Krachttests (METER, METER_ENDURANCE, TOTAL_EVALUATION, NORDIC_HAMSTRING)
 *     staan in kilogramkracht. Dat is nu gedocumenteerd, niet meer afgeleid.
 *   - Een sprong heeft drie lagen. De top-level samenvatting is relatief
 *     (veelvouden lichaamsgewicht, W/kg) en `jumpHeight` daarin is meestal een
 *     gemiddelde. `_repResults` is een ongedocumenteerde kg-laag die bij
 *     eenbenige sprongen ontbreekt. `_resultsModels` is het gedocumenteerde
 *     model per sprong, in Newton, met de massa in kg ernaast. Alleen die
 *     laatste laag lezen we.
 *   - Een afgebroken sprong staat gewoon in de lijst met overal nullen. Die
 *     moet eruit, anders zakt elk gemiddelde.
 */

export type StrengthSide = 'LEFT' | 'RIGHT' | 'BOTH'

export type StrengthRep = {
  repCode: string | null
  ordinal: number
  side: StrengthSide
  maxKg: number | null
  averageKg: number | null
  /** kg/s */
  rfdToMax: number | null
  rfdAverage: number | null
  timeToMaxMs: number | null
  /** N·s, door Kinvent al omgerekend. */
  impulseNs: number | null
}

export type StrengthReading = {
  /** Hoogste waarde per zijde, in de eenheid die Kinvent gaf (kg). */
  left: number | null
  right: number | null
  /** Gevuld bij een meting die niet per zijde is gesplitst. */
  single: number | null
  deviceType: string | null
  repCount: number
  /** Alleen bij tests die het gewicht meenemen (IMTP). In kg. */
  bodyWeightKg: number | null
  /** Elke herhaling, voor de detailweergave. */
  reps: StrengthRep[]
}

export type JumpRep = {
  /** Kinvents rep-code, de sleutel om dubbele import te voorkomen. */
  repCode: string | null
  ordinal: number
  side: StrengthSide
  jumpHeightCm: number | null
  jumpHeightByVelocityCm: number | null
  flightTimeMs: number | null
  contactTimeMs: number | null
  massKg: number | null
  weightN: number | null
  /** Bruto piekkracht, beide platen samen (of het ene been). Newton. */
  peakForceN: number | null
  peakForceLeftN: number | null
  peakForceRightN: number | null
  /** Piekkracht min lichaamsgewicht. Newton. */
  netMaxForceN: number | null
  maxPowerW: number | null
  rsi: number | null
  timeToStabilizeMs: number | null
  /** N·s */
  propulsiveImpulsePhase1: number | null
  propulsiveImpulsePhase2: number | null
  /** Rate of force development, N/s. */
  rfdTotal: number | null
  rfdLeft: number | null
  rfdRight: number | null
}

export type JumpReading = {
  /** SINGLE = CMJ/SJ/DROP (twee- of eenbenig); MULTIPLE = herhaald springen. */
  variant: 'SINGLE' | 'MULTIPLE'
  jumpType: string | null
  bodyWeightKg: number | null
  /**
   * `weight / mass` uit het sprongmodel. Hoort 9,81 te zijn; iets anders
   * betekent dat het model niet in Newton en kilogram staat.
   */
  gravityRatio: number | null
  reps: JumpRep[]
  numberOfJumps: number | null
  peakJumpHeightCm: number | null
  heightAverageCm: number | null
  rsi: number | null
  mrsi: number | null
  fatigueIndex: number | null
}

/** exerciseTypes waarvan de reps per zijde gesplitst zijn (`_repSide`). */
const PER_SIDE_REP_TYPES = new Set(['METER', 'METER_ENDURANCE'])

export function parseActivityResults(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Als `num`, maar nul telt als "niet gemeten". */
function positive(value: unknown): number | null {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function rows(parsed: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const container = parsed[key]
  return Array.isArray(container) ? (container as Record<string, unknown>[]) : []
}

function max(a: number | null, b: number): number {
  return a === null ? b : Math.max(a, b)
}

/**
 * Krachtmeting naar één waarde per zijde. Kinvent levert meerdere pogingen per
 * zijde; we nemen de hoogste, want dat is de waarde waar een criterium op
 * beoordeeld wordt.
 *
 * Geeft `null` als de vorm niet herkend wordt. Dan liever niets importeren dan
 * een getal waarvan we niet weten wat het voorstelt.
 */
export function parseStrength(
  exerciseType: string | null | undefined,
  parsed: Record<string, unknown> | null,
): StrengthReading | null {
  if (!parsed) return null
  const reps = rows(parsed, '_resultsPerRep').length ? rows(parsed, '_resultsPerRep') : rows(parsed, '_repResults')
  if (reps.length === 0) return null

  let left: number | null = null
  let right: number | null = null
  let single: number | null = null
  let deviceType: string | null = null
  let bodyWeightKg: number | null = null
  let counted = 0
  const out: StrengthRep[] = []

  const repCode = (rep: Record<string, unknown>) => (typeof rep._repCode === 'string' ? rep._repCode : null)

  if (exerciseType === 'NORDIC_HAMSTRING') {
    // Per rep allebei de benen, in kg. Geen `_repSide`; we splitsen zelf.
    for (const rep of reps) {
      const l = positive(rep._leftMaxForce)
      const r = positive(rep._rightMaxForce)
      if (l === null && r === null) continue
      counted++
      if (l !== null) {
        left = max(left, l)
        out.push({ repCode: repCode(rep), ordinal: out.length + 1, side: 'LEFT', maxKg: l, averageKg: positive(rep._averageLeft), rfdToMax: num(rep._rfdLeft), rfdAverage: null, timeToMaxMs: positive(rep._timeToMaxLeft), impulseNs: null })
      }
      if (r !== null) {
        right = max(right, r)
        out.push({ repCode: repCode(rep), ordinal: out.length + 1, side: 'RIGHT', maxKg: r, averageKg: positive(rep._averageRight), rfdToMax: num(rep._rfdRight), rfdAverage: null, timeToMaxMs: positive(rep._timeToMaxRight), impulseNs: null })
      }
    }
    return counted === 0 ? null : { left, right, single, deviceType, repCount: counted, bodyWeightKg, reps: out }
  }

  if (exerciseType === 'TOTAL_EVALUATION') {
    // Beide platen samen in `_maxValue`, links apart. Rechts wordt niet
    // geserialiseerd; Kinvent documenteert: rechts = _maxValue − _maxLeftValue.
    for (const rep of reps) {
      const total = positive(rep._maxValue)
      if (total === null) continue
      counted++
      bodyWeightKg ??= positive(rep._weight)
      out.push({ repCode: repCode(rep), ordinal: out.length + 1, side: 'BOTH', maxKg: total, averageKg: positive(rep._averageValue), rfdToMax: num(rep._rfdToMax), rfdAverage: num(rep._averageRfd), timeToMaxMs: positive(rep._timeToMax), impulseNs: num(rep._impulse) })
      const l = positive(rep._maxLeftValue)
      if (l === null) {
        single = max(single, total)
        continue
      }
      left = max(left, l)
      right = max(right, total - l)
    }
    return counted === 0 ? null : { left, right, single, deviceType, repCount: counted, bodyWeightKg, reps: out }
  }

  for (const rep of reps) {
    const value = positive(rep._maxValue) ?? positive(rep._netMaxForce)
    if (value === null) continue // afgebroken poging
    counted++
    deviceType ??= typeof rep._device === 'string' ? rep._device : null
    const side = typeof rep._repSide === 'string' ? (rep._repSide as StrengthSide) : 'BOTH'
    if (side === 'LEFT') left = max(left, value)
    else if (side === 'RIGHT') right = max(right, value)
    else single = max(single, value)
    out.push({ repCode: repCode(rep), ordinal: num(rep._repOrdinal) ?? out.length + 1, side, maxKg: value, averageKg: positive(rep._averageValue), rfdToMax: num(rep._rfdToMax), rfdAverage: num(rep._averageRfd), timeToMaxMs: positive(rep._timeToMax), impulseNs: num(rep._impulse) })
  }
  if (counted === 0) return null

  // Alleen types waarvan we weten dat de reps werkelijk per zijde gaan mogen
  // als bilateraal doorgaan; bij de rest vouwen we terug naar één waarde.
  if (!PER_SIDE_REP_TYPES.has(exerciseType ?? '') && (left !== null || right !== null)) {
    single = max(single, Math.max(left ?? 0, right ?? 0))
    return { left: null, right: null, single, deviceType, repCount: counted, bodyWeightKg, reps: out }
  }
  return { left, right, single, deviceType, repCount: counted, bodyWeightKg, reps: out }
}

/**
 * De "Body weight"-variant van TOTAL_EVALUATION: op de platen staan om het
 * lichaamsgewicht vast te leggen. Alleen `weight` in kg, geen reps. Dit is
 * het ijkpunt voor de eenheidscontrole, want BASE legt zelf geen gewicht vast.
 */
export function parseBodyWeight(parsed: Record<string, unknown> | null): number | null {
  if (!parsed) return null
  if (rows(parsed, '_resultsPerRep').length || rows(parsed, '_repResults').length) return null
  return positive(parsed.weight)
}

function side(value: unknown): StrengthSide {
  return value === 'LEFT' || value === 'RIGHT' ? value : 'BOTH'
}

function singleJumps(models: Record<string, unknown>[]): JumpRep[] {
  const out: JumpRep[] = []
  for (const model of models) {
    const jump = obj(model.jump)
    const heightM = positive(jump._jumpHeight)
    const peakForceN = positive(jump._maxForce)
    // Een sprong zonder hoogte én zonder kracht is niet gemaakt.
    if (heightM === null && peakForceN === null) continue
    const byVelocityM = positive(jump._jumpHeightByTakeOffVelocity)
    out.push({
      repCode: typeof model._repCode === 'string' ? model._repCode : null,
      ordinal: num(model.repOrdinal) ?? num(jump._ordinal) ?? out.length + 1,
      side: side(model.bodySide),
      jumpHeightCm: heightM === null ? null : heightM * 100,
      jumpHeightByVelocityCm: byVelocityM === null ? null : byVelocityM * 100,
      flightTimeMs: positive(jump._timeOnAir),
      contactTimeMs: positive(model.contactTime),
      massKg: positive(model.mass),
      weightN: positive(model.weight),
      peakForceN,
      peakForceLeftN: positive(jump._maxLeftForce),
      peakForceRightN: positive(jump._maxRightForce),
      netMaxForceN: positive(model.netMaxForce),
      maxPowerW: positive(model.maxPower),
      rsi: positive(model.reactiveStrengthIndex),
      timeToStabilizeMs: positive(model.timeToStabilize),
      propulsiveImpulsePhase1: positive(model.propulsiveImpulsePhase1),
      propulsiveImpulsePhase2: positive(model.propulsiveImpulsePhase2),
      rfdTotal: positive(model.totalRfd),
      rfdLeft: positive(model.leftRfd),
      rfdRight: positive(model.rightRfd),
    })
  }
  return out
}

function multipleJumps(jumps: Record<string, unknown>[]): JumpRep[] {
  const out: JumpRep[] = []
  for (const jump of jumps) {
    const heightM = positive(jump._jumpHeight)
    const peakForceN = positive(jump._maxForce)
    if (heightM === null && peakForceN === null) continue
    out.push({
      repCode: null,
      ordinal: num(jump._ordinal) ?? out.length + 1,
      side: 'BOTH',
      jumpHeightCm: heightM === null ? null : heightM * 100,
      jumpHeightByVelocityCm: null,
      flightTimeMs: positive(jump._timeOnAir),
      contactTimeMs: null,
      massKg: null,
      weightN: null,
      peakForceN,
      peakForceLeftN: positive(jump._maxLeftForce),
      peakForceRightN: positive(jump._maxRightForce),
      netMaxForceN: null,
      maxPowerW: null,
      rsi: null,
      timeToStabilizeMs: null,
      propulsiveImpulsePhase1: null,
      propulsiveImpulsePhase2: null,
      rfdTotal: null,
      rfdLeft: null,
      rfdRight: null,
    })
  }
  return out
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Sprongmeting (JUMP_ANALYSIS). Leest uitsluitend het gedocumenteerde model:
 * `_resultsModels` voor losse sprongen (twee- én eenbenig), `_jumps` voor
 * herhaald springen. De samenvatting bovenin en de kg-laag `_repResults`
 * blijven ongebruikt, zie de kop van dit bestand.
 */
export function parseJump(parsed: Record<string, unknown> | null): JumpReading | null {
  if (!parsed) return null
  const jumpType = typeof parsed.jumpType === 'string' ? parsed.jumpType : null

  const models = rows(parsed, '_resultsModels')
  if (models.length > 0) {
    const reps = singleJumps(models)
    if (reps.length === 0) return null
    const ratios = reps.flatMap((r) => (r.massKg && r.weightN ? [r.weightN / r.massKg] : []))
    return {
      variant: 'SINGLE',
      jumpType,
      bodyWeightKg: median(reps.flatMap((r) => (r.massKg ? [r.massKg] : []))),
      gravityRatio: median(ratios),
      reps,
      numberOfJumps: reps.length,
      peakJumpHeightCm: null,
      heightAverageCm: null,
      rsi: null,
      mrsi: null,
      fatigueIndex: null,
    }
  }

  const jumps = rows(parsed, '_jumps')
  if (jumps.length > 0) {
    const reps = multipleJumps(jumps)
    if (reps.length === 0) return null
    const heights = reps.flatMap((r) => (r.jumpHeightCm === null ? [] : [r.jumpHeightCm]))
    return {
      variant: 'MULTIPLE',
      jumpType,
      bodyWeightKg: positive(parsed.weight),
      gravityRatio: null,
      reps,
      numberOfJumps: num(parsed._numberOfJumps) ?? reps.length,
      peakJumpHeightCm: heights.length ? Math.max(...heights) : null,
      heightAverageCm: heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : null,
      rsi: positive(parsed._rsi),
      mrsi: positive(parsed._mrsi),
      fatigueIndex: num(parsed._fatigueIndex),
    }
  }

  return null
}
