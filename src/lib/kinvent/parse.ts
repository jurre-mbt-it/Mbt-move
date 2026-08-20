/**
 * `ActivityAnalysisResult.activityResults` uitlezen.
 *
 * Kinvent levert dit als stringified JSON zonder schema in hun spec. De vorm
 * verschilt per `exerciseType`, en niet alleen daarop: dezelfde `TOTAL_EVALUATION`
 * gaf op hun testomgeving alleen `weight` en in onze praktijkdata een volledig
 * bilateraal schema. Alles hieronder is daarom afgeleid uit echte metingen van
 * de praktijk, niet uit documentatie, en alles is defensief: onbekende vormen
 * leveren `null` op in plaats van een half ingevulde meting.
 *
 * Twee valkuilen die uit die data kwamen:
 *   - Reps zitten bij METER-achtige types in `_resultsPerRep` en bij sprongen in
 *     `_repResults`. JUMP_ANALYSIS heeft ze allebei plus `_resultsModels`.
 *   - Een afgebroken sprong staat gewoon in de lijst met overal nullen. Die
 *     moet eruit, anders zakt elk gemiddelde.
 */

export type StrengthSide = 'LEFT' | 'RIGHT' | 'BOTH'

export type StrengthReading = {
  /** Hoogste waarde per zijde, in de eenheid die Kinvent gaf (kg). */
  left: number | null
  right: number | null
  /** Gevuld bij een meting die niet per zijde is gesplitst. */
  single: number | null
  deviceType: string | null
  repCount: number
}

export type JumpRep = {
  ordinal: number
  jumpHeight: number | null
  jumpHeightByVelocity: number | null
  peakForceLeft: number | null
  peakForceRight: number | null
  peakForceTotal: number | null
  peakPowerTotal: number | null
  decelRfdTotal: number | null
  landingTimeToStabilization: number | null
  propulsiveImpulsePhaseOne: number | null
  propulsiveImpulsePhaseTwo: number | null
  contactTime: number | null
  flightTime: number | null
  reactiveStrengthIndex: number | null
}

export type JumpReading = {
  jumpType: string | null
  bodyWeightKg: number | null
  numberOfJumps: number | null
  peakJumpHeight: number | null
  heightAverage: number | null
  rsi: number | null
  mrsi: number | null
  fatigueIndex: number | null
  reps: JumpRep[]
}

/** exerciseTypes waarvan we weten dat de reps per zijde gesplitst zijn. */
const BILATERAL_REP_TYPES = new Set(['METER', 'METER_ENDURANCE'])

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

function reps(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const container = parsed._resultsPerRep ?? parsed._repResults
  return Array.isArray(container) ? (container as Record<string, unknown>[]) : []
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
  const rows = reps(parsed)
  if (rows.length === 0) return null

  let left: number | null = null
  let right: number | null = null
  let single: number | null = null
  let deviceType: string | null = null
  let counted = 0

  for (const rep of rows) {
    const value = num(rep._maxValue) ?? num(rep._netMaxForce)
    if (value === null || value === 0) continue // afgebroken poging
    counted++
    deviceType ??= typeof rep._device === 'string' ? rep._device : null
    const side = typeof rep._repSide === 'string' ? (rep._repSide as StrengthSide) : 'BOTH'
    if (side === 'LEFT') left = Math.max(left ?? 0, value)
    else if (side === 'RIGHT') right = Math.max(right ?? 0, value)
    else single = Math.max(single ?? 0, value)
  }
  if (counted === 0) return null

  // Alleen types waarvan we in de praktijkdata zagen dat de reps daadwerkelijk
  // per zijde gaan, mogen als bilateraal doorgaan. TOTAL_EVALUATION geeft
  // `_repSide: 'BOTH'` met een losse `_maxLeftValue`, waaruit de rechterzijde
  // niet betrouwbaar af te leiden is; die laten we bewust als enkele waarde.
  if (!BILATERAL_REP_TYPES.has(exerciseType ?? '') && (left !== null || right !== null)) {
    single ??= Math.max(left ?? 0, right ?? 0)
    return { left: null, right: null, single, deviceType, repCount: counted }
  }
  return { left, right, single, deviceType, repCount: counted }
}

/**
 * Sprongmeting (JUMP_ANALYSIS).
 *
 * De payload mengt twee naamconventies: samenvattingen staan met underscore
 * (`_peakJumpHeight`), de sprongen zelf zonder (`peakForceTotal`). Sprongen
 * waarin alles nul is, zijn afgebroken pogingen en tellen niet mee.
 */
export function parseJump(parsed: Record<string, unknown> | null): JumpReading | null {
  if (!parsed) return null
  const rows = reps(parsed)

  const parsedReps: JumpRep[] = []
  for (const rep of rows) {
    const height = num(rep.jumpHeight)
    const force = num(rep.peakForceTotal)
    // Een sprong zonder hoogte én zonder kracht is niet gemaakt.
    if ((height ?? 0) === 0 && (force ?? 0) === 0) continue
    parsedReps.push({
      ordinal: num(rep.ordinal) ?? num(rep._repOrdinal) ?? parsedReps.length + 1,
      jumpHeight: height,
      jumpHeightByVelocity: num(rep.jumpHeightByVelocity),
      peakForceLeft: num(rep.peakForceLeft),
      peakForceRight: num(rep.peakForceRight),
      peakForceTotal: force,
      peakPowerTotal: num(rep.maxPowerTotal) ?? num(rep.peakPowerTotal),
      decelRfdTotal: num(rep.decelRfdTotal),
      landingTimeToStabilization: num(rep.landingTimeToStabilization),
      propulsiveImpulsePhaseOne: num(rep.propulsiveImpulsePhaseOne),
      propulsiveImpulsePhaseTwo: num(rep.propulsiveImpulsePhaseTwo),
      contactTime: num(rep.contactTime),
      flightTime: num(rep.flightTime),
      reactiveStrengthIndex: num(rep.reactiveStrengthIndex) ?? num(rep.rsi),
    })
  }
  if (parsedReps.length === 0) return null

  return {
    jumpType: typeof parsed.jumpType === 'string' ? parsed.jumpType : null,
    bodyWeightKg: num(parsed.weight) ?? num(parsed._weight),
    numberOfJumps: num(parsed._numberOfJumps) ?? parsedReps.length,
    peakJumpHeight: num(parsed._peakJumpHeight),
    heightAverage: num(parsed._heightAverage),
    rsi: num(parsed._rsi),
    mrsi: num(parsed._mrsi),
    fatigueIndex: num(parsed._fatigueIndex),
    reps: parsedReps,
  }
}
