/**
 * Clinical Insight Engine (CIE) — shared types.
 */
import type { InsightUrgency } from '@prisma/client'

export interface PatientAggregates {
  patientId: string
  patientName: string
  now: Date
  /** Completed sessions sorted newest-first, within last 60 days. */
  sessions: Array<{
    id: string
    completedAt: Date | null
    painLevel: number | null
    exertionLevel: number | null
    exerciseLogs: Array<{
      exerciseId: string
      painLevel: number | null
      painDuring: number | null
      weight: number | null
      setsCompleted: number | null
    }>
  }>
  /** Median NRS (session.painLevel) over sessions 4..N (outside the recent-3 window). */
  baselineMedianNRS: number | null
  /** Average NRS over the most-recent 3 sessions. */
  recentAvgNRS: number | null
  /** Completed-session count last 7 days. */
  recentCount7d: number
  /** Completed-session count in the 14 days before that (scaled to 7d: total/2). */
  priorCount7dScaled: number
  /** recentCount7d / priorCount7dScaled, or null if prior is 0. */
  adherenceRatio: number | null
  daysSinceLastSession: number | null
  /** Number of days since the last measurable change in pain/exertion/weight. null if not computable. */
  daysSinceChange: number | null
  /** Per-exercise aggregates across sessions[0..N]. */
  exerciseAggregates: Array<{
    exerciseId: string
    executions: number
    avgPainLevel: number | null
  }>
  /** Average painLevel across ALL exerciseLogs (for exercise_specific_pain comparison). */
  overallAvgExercisePain: number | null
}

export interface RuleDefinition {
  signalType: string
  defaultUrgency: InsightUrgency
  defaultConfig: Record<string, unknown>
}

export interface EvaluatorResult {
  title: string
  suggestion: string
  triggerData: Record<string, unknown>
  urgency: InsightUrgency
  exerciseId?: string | null
}

export type Evaluator = (
  aggregates: PatientAggregates,
  rule: RuleDefinition,
) => EvaluatorResult | null
