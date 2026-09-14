import { TRPCError } from '@trpc/server'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Rollen in een atletengroep, oplopend. De tabel in de spec is leidend:
 * VIEWER kijkt mee, PLANNER bewerkt de groepskalender, MANAGER verzendt en
 * beheert leden, OWNER (de coach) beheert ook de staf en mag verwijderen.
 */
export type GroupRole = 'OWNER' | 'VIEWER' | 'PLANNER' | 'MANAGER'

const RANG: Record<GroupRole, number> = { VIEWER: 1, PLANNER: 2, MANAGER: 3, OWNER: 4 }

export function roleAllows(role: GroupRole, minimaal: GroupRole): boolean {
  return RANG[role] >= RANG[minimaal]
}

type GroupUser = { id: string; role: string }

/** Welke groepen ziet deze gebruiker? Admin alles, de rest waar hij staf is. */
export function groupsWhereForUser(user: GroupUser): Prisma.AthleteGroupWhereInput {
  if (user.role === 'ADMIN') return {}
  return { staff: { some: { userId: user.id } } }
}

/**
 * Controleer de rol van de gebruiker in de groep. Admin leest altijd mee maar
 * schrijft niet (zoals overal in het coachportaal). Gooit NOT_FOUND als de
 * groep niet bestaat of onzichtbaar is, FORBIDDEN bij te weinig rechten.
 */
export async function assertGroupRole(
  prisma: PrismaClient,
  user: GroupUser,
  groupId: string,
  minimaal: GroupRole,
): Promise<{ id: string; ownerId: string; role: GroupRole }> {
  const group = await prisma.athleteGroup.findUnique({
    where: { id: groupId },
    select: { id: true, ownerId: true, staff: { where: { userId: user.id }, select: { role: true } } },
  })
  if (!group) throw new TRPCError({ code: 'NOT_FOUND', message: 'Groep niet gevonden' })
  const eigen = group.staff[0]?.role as GroupRole | undefined
  if (!eigen) {
    if (user.role === 'ADMIN') {
      if (minimaal === 'VIEWER') return { id: group.id, ownerId: group.ownerId, role: 'VIEWER' }
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Als beheerder kijk je alleen mee in een groep' })
    }
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Groep niet gevonden' })
  }
  if (!roleAllows(eigen, minimaal)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Onvoldoende rechten in deze groep' })
  }
  return { id: group.id, ownerId: group.ownerId, role: eigen }
}
