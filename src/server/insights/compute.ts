/**
 * CIE orchestrator — runs every 4 hours via Vercel Cron.
 *
 * Per run:
 *   1. Find opted-in patients in CIE-enabled practices (patient_insight_status.enabled=true
 *      AND no objection AND practice.cieEnabled=true).
 *   2. For each: find active treating therapists (isActive + APPROVED).
 *      Skip if 0.
 *   3. Build aggregates once.
 *   4. Run all 6 evaluators.
 *   5. Dedup: skip if open/recent insight of same signal_type exists within
 *      the per-signal dedup window (24h for CRITICAL, 7d for the rest).
 *   6. Insert new insights.
 *   7. Dispatch notifications (email for critical, in-app rows for all).
 */
import type { PrismaClient, InsightUrgency, InsightStatus } from '@prisma/client'
import { buildPatientAggregates } from './aggregates'
import type { Evaluator, RuleDefinition } from './types'
import { painFlare } from './rules/painFlare'
import { painRedFlag } from './rules/painRedFlag'
import { readyForProgression } from './rules/readyForProgression'
import { plateau } from './rules/plateau'
import { adherenceDrop } from './rules/adherenceDrop'
import { exerciseSpecificPain } from './rules/exerciseSpecificPain'
import { dispatchInsightNotifications } from './dispatcher'

const EVALUATORS: Record<string, Evaluator> = {
  pain_flare: painFlare,
  pain_red_flag: painRedFlag,
  ready_for_progression: readyForProgression,
  plateau,
  adherence_drop: adherenceDrop,
  exercise_specific_pain: exerciseSpecificPain,
}

const INSIGHT_TTL_DAYS = 14

function dedupWindowMs(urgency: InsightUrgency): number {
  // CRITICAL: 24h. Others: 7d (per spec "max 1x per 7 dagen per signaaltype").
  return urgency === 'CRITICAL' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000
}

export interface ComputeResult {
  patientsEvaluated: number
  insightsCreated: number
  insightsSkippedDedup: number
  patientsSkipped: { patientId: string; reason: string }[]
  errors: { patientId: string; error: string }[]
}

export async function computeInsights(
  prisma: PrismaClient,
  opts: { patientId?: string } = {},
): Promise<ComputeResult> {
  const result: ComputeResult = {
    patientsEvaluated: 0,
    insightsCreated: 0,
    insightsSkippedDedup: 0,
    patientsSkipped: [],
    errors: [],
  }

  // 1. Load candidate patients: enabled + no objection + (legacy practiceId=null
  //    OR practice.cieEnabled=true). Legacy-patients zonder praktijk zijn van
  //    vóór de multi-tenant uitrol; we laten ze standaard opt-in doen omdat er
  //    geen praktijk-gate is.
  const statuses = await prisma.patientInsightStatus.findMany({
    where: {
      enabled: true,
      patientObjection: false,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
      patient: {
        deletedAt: null,
        OR: [
          { practiceId: null },
          { practice: { cieEnabled: true } },
        ],
      },
    },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          email: true,
          patientTherapists: {
            where: { isActive: true, status: 'APPROVED' },
            select: { therapistId: true },
          },
        },
      },
    },
  })

  // 2. Load rule catalog once (id → rule definition)
  const rules = await prisma.insightRule.findMany({ where: { enabledGlobally: true } })
  const rulesBySignal = new Map<string, RuleDefinition>(
    rules.map((r) => [
      r.signalType,
      {
        signalType: r.signalType,
        defaultUrgency: r.defaultUrgency,
        defaultConfig: r.defaultConfig as Record<string, unknown>,
      },
    ]),
  )

  for (const status of statuses) {
    const patientId = status.patientId
    result.patientsEvaluated++

    // Skip if no active treating therapists
    if (status.patient.patientTherapists.length === 0) {
      result.patientsSkipped.push({ patientId, reason: 'no_active_therapist' })
      continue
    }

    try {
      const aggregates = await buildPatientAggregates(prisma, patientId)
      if (!aggregates) {
        result.patientsSkipped.push({ patientId, reason: 'aggregates_null' })
        continue
      }

      for (const [signalType, evaluator] of Object.entries(EVALUATORS)) {
        const rule = rulesBySignal.get(signalType)
        if (!rule) continue

        const evaluation = evaluator(aggregates, rule)
        if (!evaluation) continue

        // Dedup
        const windowStart = new Date(aggregates.now.getTime() - dedupWindowMs(evaluation.urgency))
        const existing = await prisma.insight.findFirst({
          where: {
            patientId,
            signalType,
            createdAt: { gte: windowStart },
          },
          select: { id: true },
        })
        if (existing) {
          result.insightsSkippedDedup++
          continue
        }

        const expiresAt = new Date(aggregates.now.getTime() + INSIGHT_TTL_DAYS * 24 * 3600 * 1000)
        const inserted = await prisma.insight.create({
          data: {
            patientId,
            signalType,
            urgency: evaluation.urgency,
            title: evaluation.title,
            suggestion: evaluation.suggestion,
            triggerData: evaluation.triggerData as object,
            exerciseId: evaluation.exerciseId ?? null,
            status: 'OPEN' as InsightStatus,
            expiresAt,
          },
        })
        result.insightsCreated++

        // 7. Notifications — dispatch to all active treating therapists
        await dispatchInsightNotifications(prisma, {
          insight: inserted,
          patientName: aggregates.patientName,
          therapistIds: status.patient.patientTherapists.map((t) => t.therapistId),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ patientId, error: message })
    }
  }

  return result
}
