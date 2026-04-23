/**
 * exercise_specific_pain (MEDIUM)
 * One specific exercise has avg NRS >= `deltaAbove` points higher than the
 * overall exercise-NRS average, over at least `minExecutions` executions.
 *
 * Exercise identity = Exercise.id (not name or variant-chain).
 */
import type { Evaluator } from '../types'

export const exerciseSpecificPain: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as { deltaAbove: number; minExecutions: number }
  if (agg.overallAvgExercisePain == null) return null

  let worst: {
    exerciseId: string
    avg: number
    delta: number
    executions: number
  } | null = null
  for (const ea of agg.exerciseAggregates) {
    if (ea.executions < cfg.minExecutions) continue
    if (ea.avgPainLevel == null) continue
    const delta = ea.avgPainLevel - agg.overallAvgExercisePain
    if (delta < cfg.deltaAbove) continue
    if (!worst || delta > worst.delta) {
      worst = { exerciseId: ea.exerciseId, avg: ea.avgPainLevel, delta, executions: ea.executions }
    }
  }
  if (!worst) return null

  return {
    title: `Pijn-patroon bij specifieke oefening voor ${agg.patientName}`,
    suggestion: `Eén oefening scoort gemiddeld ${worst.avg.toFixed(1)} NRS (${worst.delta.toFixed(1)} hoger dan de overige oefeningen van ${agg.patientName}) over ${worst.executions} uitvoeringen. Overweeg aanpassing of vervanging.`,
    triggerData: {
      exerciseId: worst.exerciseId,
      avgPainLevel: worst.avg,
      overallAvgExercisePain: agg.overallAvgExercisePain,
      delta: worst.delta,
      executions: worst.executions,
    },
    urgency: rule.defaultUrgency,
    exerciseId: worst.exerciseId,
  }
}
