/**
 * Anonymisation pipeline — server-side ONLY.
 * Never import this file from client components.
 *
 * Security guarantees:
 * - AnonymousIdMapping is accessed only here; never returned via API.
 * - PII (name, email, dateOfBirth) is never written to AnonymizedRecord.
 * - Age is computed at call time from dateOfBirth and stored as an integer.
 */

import { prisma } from '@/lib/prisma'
import { normalizeDiagnosis } from '@/lib/diagnosis-normalization'

/** Current consent version. Bump this string when consent text changes. */
export const CONSENT_VERSION = '1.0'

/**
 * Get-or-create the anonymous ID for a given user.
 * NEVER expose this mapping outside server-side code.
 */
async function getAnonymousId(userId: string): Promise<string> {
  const existing = await prisma.anonymousIdMapping.findUnique({ where: { userId } })
  if (existing) return existing.anonymousId

  const created = await prisma.anonymousIdMapping.create({ data: { userId } })
  return created.anonymousId
}

/**
 * Compute age in full years from a date of birth.
 * Returns null when dateOfBirth is null.
 */
function computeAge(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--
  }
  return age
}

/**
 * Anonymise a completed SessionLog into one or more AnonymizedRecords.
 * Safe to call multiple times — duplicate logic is handled at the caller.
 *
 * Returns the number of records created, or 0 if consent is not given.
 */
export async function anonymizeSession(sessionLogId: string): Promise<number> {
  // 1. Load session with patient
  const session = await prisma.sessionLog.findUnique({
    where: { id: sessionLogId },
    include: {
      patient: {
        select: {
          id: true,
          dateOfBirth: true,
          // notes / specialty fields could hold diagnosis text
          bio: true,
          researchConsent: { select: { consentGiven: true } },
        },
      },
      exerciseLogs: {
        include: { session: false },
      },
    },
  })

  if (!session) return 0

  // 2. Check consent
  if (!session.patient.researchConsent?.consentGiven) return 0

  // 3. Resolve anonymous ID
  const anonymousId = await getAnonymousId(session.patient.id)

  // 4. Compute age (never store DOB)
  const age = computeAge(session.patient.dateOfBirth)
  if (age === null) return 0 // skip if we have no age at all

  // 5. Normalise diagnosis from bio (placeholder — real impl would use a dedicated diagnosis field)
  const diagnosisCategory = normalizeDiagnosis(session.patient.bio ?? null)

  // 6. Create one AnonymizedRecord per exercise log
  let created = 0
  for (const log of session.exerciseLogs) {
    await prisma.anonymizedRecord.create({
      data: {
        anonymousId,
        recordDate: session.completedAt ?? session.scheduledAt,
        ageAtRecord: age,
        diagnosisCategory,
        exerciseName: log.exerciseId, // exerciseId only — no PII
        setsCompleted: log.setsCompleted,
        repsCompleted: log.repsCompleted,
        sessionDuration: session.duration,
        painLevel: log.painLevel ?? session.painLevel,
        exertionLevel: session.exertionLevel,
      },
    })
    created++
  }

  // If the session had no exercise logs, still create one summary record
  if (session.exerciseLogs.length === 0) {
    await prisma.anonymizedRecord.create({
      data: {
        anonymousId,
        recordDate: session.completedAt ?? session.scheduledAt,
        ageAtRecord: age,
        diagnosisCategory,
        sessionDuration: session.duration,
        painLevel: session.painLevel,
        exertionLevel: session.exertionLevel,
      },
    })
    created++
  }

  return created
}

/**
 * Withdraw consent for a user.
 * Hard-deletes all AnonymizedRecords and the AnonymousIdMapping for this user.
 * Call this whenever the patient sets consentGiven = false.
 */
export async function withdrawConsent(userId: string): Promise<void> {
  const mapping = await prisma.anonymousIdMapping.findUnique({ where: { userId } })
  if (mapping) {
    await prisma.anonymizedRecord.deleteMany({ where: { anonymousId: mapping.anonymousId } })
    await prisma.anonymousIdMapping.delete({ where: { userId } })
  }
  // Also update the consent record to reflect withdrawal
  await prisma.researchConsent.upsert({
    where: { userId },
    create: { userId, consentGiven: false, consentVersion: CONSENT_VERSION },
    update: { consentGiven: false, consentGivenAt: null },
  })
}
