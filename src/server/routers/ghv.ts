/**
 * Geheimhoudingsverklaring (GHV) tRPC router.
 *
 * Therapeuten accepteren de geheimhoudingsverklaring in-app vóór ze
 * dossier-toegang krijgen (gate in require-role.ts, alleen rol THERAPIST).
 * Gespiegeld aan de DPA-flow voor patiënten. Het getekende papieren
 * exemplaar in het personeelsdossier blijft het primaire juridische stuk;
 * deze registratie is de technische afdwinging plus bewijs van kennisname.
 */

import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { GHV_VERSION } from '@/lib/ghv-constants'
import { auditLog } from '@/server/audit'

export const ghvRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { ghvAcceptedVersion: true, ghvAcceptedAt: true },
    })
    const accepted = user?.ghvAcceptedVersion === GHV_VERSION
    return {
      accepted,
      currentVersion: GHV_VERSION,
      acceptedVersion: user?.ghvAcceptedVersion ?? null,
      acceptedAt: user?.ghvAcceptedAt?.toISOString() ?? null,
    }
  }),

  accept: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        ghvAcceptedVersion: GHV_VERSION,
        ghvAcceptedAt: new Date(),
      },
    })
    await auditLog({
      event: 'GHV_ACCEPTED',
      userId: ctx.user.id,
      actorEmail: ctx.user.email,
      metadata: { version: GHV_VERSION },
      req: ctx.req,
    })
    return { accepted: true, version: GHV_VERSION }
  }),
})
