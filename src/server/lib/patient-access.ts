import type { PrismaClient } from '@prisma/client'
import { TRPCError } from '@trpc/server'

type AccessUser = { id: string; role: string; practiceId: string | null }

/**
 * Mag `user` bij de patiëntdata van `patientId`?
 *
 * Regel (zie AGENTS.md): toegang = directe PatientTherapist-koppeling OF
 * zelfde praktijk als de patiënt. ADMIN mag altijd; een gebruiker mag altijd
 * bij zijn eigen dossier.
 *
 * COACH (zie docs/plan-coach-role-20260721.md) mag ALLEEN via een directe
 * koppeling. Een coach hoort nooit een practiceId te hebben; de praktijk-tak
 * is voor die rol hard uitgezet.
 *
 * KRITIEK — de praktijk-tak geldt ALLEEN voor THERAPIST/ADMIN. Patiënten en
 * atleten krijgen bij invite dezelfde `practiceId` als hun therapeut; zonder
 * deze rol-check zou een patiënt/atleet via de praktijk-tak bij het dossier
 * van elke mede-patiënt kunnen. Deze helper is de enige plek waar die tak
 * hoort te leven — kopieer de query niet opnieuw in routers.
 */
export async function hasPatientAccess(
  prisma: PrismaClient,
  user: AccessUser,
  patientId: string,
): Promise<boolean> {
  if (user.role === 'ADMIN') return true
  if (patientId === user.id) return true
  if (user.role !== 'THERAPIST' && user.role !== 'COACH') return false
  // COACH heeft per definitie practiceId null, dus de praktijk-tak valt voor
  // een coach altijd weg: alleen een directe koppeling geeft toegang. Die
  // eigenschap wordt hieronder expliciet afgedwongen i.p.v. impliciet
  // vertrouwd, zodat een per ongeluk gevulde practiceId geen praktijk-brede
  // inzage oplevert.
  const viaPractice = user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
          },
        },
        ...viaPractice,
      ],
    },
    select: { id: true },
  })
  return !!found
}

type ScopeUser = { role: string; practiceId: string | null }

/**
 * Praktijk-tak voor een Prisma `where`-OR-fragment. ALLEEN een THERAPIST met
 * een practiceId krijgt de praktijk-brede tak. COACH (practiceId is altijd
 * null) en PATIENT/ATHLETE (delen de practiceId van hun therapeut!) niet —
 * zonder deze rol-check zou een patiënt via de praktijk-tak bij het dossier
 * van elke mede-patiënt kunnen. Zie AGENTS.md. Gebruik als spread:
 *   `OR: [ ...directe koppeling..., ...practiceScope(user) ]`.
 */
export function practiceScope(user: ScopeUser): { practiceId: string }[] {
  return user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []
}

/**
 * Boolean-variant van {@link practiceScope}: hoort `resourcePracticeId` bij
 * dezelfde praktijk als `user`? Zelfde rol-binding (alleen THERAPIST).
 */
export function inSamePractice(user: ScopeUser, resourcePracticeId: string | null): boolean {
  return user.role === 'THERAPIST' && !!user.practiceId && resourcePracticeId === user.practiceId
}

/** Als {@link hasPatientAccess} false is: gooi FORBIDDEN i.p.v. stil falen. */
export async function assertPatientAccess(
  prisma: PrismaClient,
  user: AccessUser,
  patientId: string,
  message = 'Geen toegang tot deze patiënt',
): Promise<void> {
  if (!(await hasPatientAccess(prisma, user, patientId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message })
  }
}
