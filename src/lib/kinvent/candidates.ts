/**
 * Van lichte protocollen plus analyses naar een voorstel voor de therapeut.
 *
 * Pure functie: geen database, geen netwerk. De router voert aan wat BASE al
 * weet (welke codes eerder zijn geïmporteerd, het laatst bekende gewicht) en
 * krijgt kandidaten terug die hij alleen nog hoeft te tonen. Schrijven gebeurt
 * hier nooit; dat is een aparte stap na een keuze van de therapeut.
 *
 * De eenheidscontrole loopt in tijdsvolgorde mee: een gewichtsmeting van
 * Kinvent (op de platen staan) of een geslaagde sprong wordt het ijkpunt voor
 * alles wat erna komt. Zo vangt een reeks van dezelfde patiënt een omzetting
 * naar ponden op, ook als BASE zelf geen gewicht kent.
 */
import type { KinventAnalysis, KinventProtocol } from './client'
import { parseActivityResults, parseBodyWeight, parseJump, parseStrength, type JumpReading, type StrengthReading } from './parse'
import { checkUnit, lsi, type UnitCheck } from './units'

export type ImportCandidate = {
  protocolCode: string
  activityCode: string
  performedAt: Date
  exerciseType: string | null
  title: string | null
  deviceType: string | null
  kind: 'STRENGTH' | 'JUMP'
  /** Krachtwaarden zoals Kinvent ze gaf, in kilogram. */
  left: number | null
  right: number | null
  single: number | null
  lsi: number | null
  /** Beste sprong van de meting, in centimeter. */
  jumpHeightCm: number | null
  /** Reactive strength index van die beste sprong. */
  rsi: number | null
  /** De volledige sprongmeting, voor het wegschrijven na bevestiging. */
  jump: JumpReading | null
  /** De volledige krachtmeting met herhalingen, idem. */
  strength: StrengthReading | null
  unit: UnitCheck
  /** Al eerder geïmporteerd voor deze patiënt. */
  alreadyImported: boolean
}

export type CandidateInput = {
  protocols: KinventProtocol[]
  analyses: KinventAnalysis[]
  /** Activity-codes die al in een rapport van deze patiënt staan. */
  knownActivityCodes: Set<string>
  /** Protocol-codes waarvan al iets is geïmporteerd (rapporten én sprongen). */
  knownProtocolCodes: Set<string>
  /** Wat Kinvent meldt als verwijderd. */
  deletedProtocolCodes: string[]
  /** Laatst bekende lichaamsgewicht van deze patiënt uit Kinvent, in kg. */
  referenceWeightKg: number | null
}

export type CandidateOutput = {
  /** Nieuwste eerst. */
  candidates: ImportCandidate[]
  /** Het ijkpunt na deze ronde, om te bewaren voor de volgende. */
  referenceWeightKg: number | null
  /** Eerder geïmporteerde protocollen die bij Kinvent niet meer bestaan. */
  removedProtocolCodes: string[]
}

function moment(protocol: KinventProtocol): number {
  return protocol.createdOn ?? protocol.updatedOn ?? 0
}

export function buildCandidates(input: CandidateInput): CandidateOutput {
  const byProtocol = new Map(input.analyses.map((a) => [a.protocolCode, a]))
  const ordered = [...input.protocols].sort((a, b) => moment(a) - moment(b))
  let reference = input.referenceWeightKg
  const candidates: ImportCandidate[] = []

  for (const protocol of ordered) {
    const analysis = byProtocol.get(protocol.code)
    if (!analysis) continue // niet toegankelijk of geen analyzer; Kinvent laat hem stil weg
    const activities = [...(analysis.activitiesResults ?? [])].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))

    for (const activity of activities) {
      const activityCode = activity.activityCode
      if (!activityCode) continue
      const fromProtocol = protocol.activities?.find((a) => a.code === activityCode)
      const config = activity.config ?? fromProtocol?.config ?? null
      const exerciseType = config?.exerciseType ?? null
      const title = config?.title ?? null
      const parsed = parseActivityResults(activity.activityResults)
      const performedAt = new Date(activity.startTime ?? fromProtocol?.startTime ?? moment(protocol))
      const base = {
        protocolCode: protocol.code,
        activityCode,
        performedAt,
        exerciseType,
        title,
        alreadyImported: input.knownActivityCodes.has(activityCode),
      }

      if (exerciseType === 'JUMP_ANALYSIS') {
        const jump = parseJump(parsed)
        if (!jump) continue
        const unit = checkUnit(jump.bodyWeightKg, reference, jump.gravityRatio)
        if (unit.status === 'ok' && jump.bodyWeightKg) reference = jump.bodyWeightKg
        const best = jump.reps.reduce((top, rep) => ((rep.jumpHeightCm ?? -1) > (top.jumpHeightCm ?? -1) ? rep : top), jump.reps[0])
        candidates.push({
          ...base,
          deviceType: 'K-DELTA',
          kind: 'JUMP',
          left: null,
          right: null,
          single: null,
          lsi: null,
          jumpHeightCm: best.jumpHeightCm,
          rsi: best.rsi,
          jump,
          strength: null,
          unit,
        })
        continue
      }

      const bodyWeight = parseBodyWeight(parsed)
      if (bodyWeight !== null) {
        // Op de platen staan om te wegen. Geen meting om te importeren, wel
        // het ijkpunt voor alles wat erna komt.
        if (checkUnit(bodyWeight, reference).status === 'ok') reference = bodyWeight
        continue
      }

      const strength = parseStrength(exerciseType, parsed)
      if (!strength) continue
      // Krachttests blijven onbeslist over de eenheid en leunen op de wegingen
      // en sprongen van dezelfde patiënt. Het `_weight` dat bij een IMTP
      // meekomt is daar bewust niet bij: in de praktijk stond daar 24,4 en
      // 55,8 bij iemand van 78 kg, dus dat is geen lichaamsgewicht.
      const unit = checkUnit(null)
      candidates.push({
        ...base,
        deviceType: strength.deviceType,
        kind: 'STRENGTH',
        left: strength.left,
        right: strength.right,
        single: strength.single,
        lsi: lsi(strength.left, strength.right),
        jumpHeightCm: null,
        rsi: null,
        jump: null,
        strength,
        unit,
      })
    }
  }

  candidates.sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
  const deleted = new Set(input.deletedProtocolCodes)
  const removedProtocolCodes = [...input.knownProtocolCodes].filter((code) => deleted.has(code))
  return { candidates, referenceWeightKg: reference, removedProtocolCodes }
}
