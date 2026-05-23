import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export type PrintActor = {
  id: string
  email: string
  name: string | null
  role: string
  practiceId: string | null
  canUseAssessment: boolean
}

/**
 * Ophalen van de huidige user voor een print-route. Resolved supabase
 * cookie → Prisma User. Geeft null als niet ingelogd of niet bekend.
 */
export async function getPrintActor(): Promise<PrintActor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [
        { supabaseUserId: user.id },
        ...(user.email ? [{ email: user.email }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      practiceId: true,
      canUseAssessment: true,
    },
  })

  return dbUser
}

/**
 * Spiegel van `hasPatientAccess` uit `patients.ts`: directe
 * PatientTherapist-koppeling, of dezelfde praktijk, of ADMIN.
 */
export async function actorCanSeePatient(
  actor: PrintActor,
  patientId: string,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: {
              therapistId: actor.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
          },
        },
        ...(actor.practiceId ? [{ practiceId: actor.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  return !!found
}

/**
 * Strictere check voor assessment: actieve APPROVED behandelrelatie of admin.
 * Spiegelt `assertTreating` uit `assessments.ts` — we volgen daar bewust niet
 * de praktijk-route omdat assessment-data extra gevoelig is.
 */
export async function actorIsTreating(
  actor: PrintActor,
  patientId: string,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  const relation = await prisma.patientTherapist.findFirst({
    where: {
      therapistId: actor.id,
      patientId,
      isActive: true,
      status: 'APPROVED',
    },
    select: { id: true },
  })
  return !!relation
}
