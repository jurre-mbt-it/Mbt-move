import type { PrismaClient } from '@prisma/client'
import { TRPCError } from '@trpc/server'

type ScopeUser = { id: string; role: string; practiceId: string | null }

/**
 * Wie mag welk trainingsplan zien.
 *
 * "Globale seed" = geen praktijk EN niet van een coach. Zonder die tweede
 * voorwaarde ziet elke therapeut de plannen van elke coach, want een
 * coach-plan heeft óók practiceId null. Zie AGENTS.md.
 */
export function planScope(user: ScopeUser) {
  if (user.role === 'COACH') return [{ practiceId: null, creatorId: user.id }]
  const seeds = { practiceId: null, creator: { role: { not: 'COACH' as const } } }
  return user.practiceId ? [seeds, { practiceId: user.practiceId }] : [seeds]
}

/** Gooit FORBIDDEN als het plan buiten de scope van deze gebruiker valt. */
export async function assertPlanAccess(
  prisma: PrismaClient,
  user: ScopeUser,
  planTemplateId: string,
): Promise<void> {
  if (user.role === 'ADMIN') return
  const found = await prisma.weekPlanTemplate.findFirst({
    where: { id: planTemplateId, OR: planScope(user) },
    select: { id: true },
  })
  if (!found) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot dit plan' })
}
