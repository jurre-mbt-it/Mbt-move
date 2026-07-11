/**
 * DPA (Verwerkingsovereenkomst) tRPC router.
 *
 * AVG-verplicht voor fysiotherapie praktijken. Aparte overeenkomst van research consent.
 * Versie bijgehouden in User model (dpaAcceptedVersion + dpaAcceptedAt).
 */

import { createTRPCRouter, protectedProcedure, adminProcedure, invalidateUserCache } from '@/server/trpc'
import { DPA_VERSION } from '@/lib/dpa-constants'

export { DPA_VERSION }

export const dpaRouter = createTRPCRouter({
  // ── Patiënt: eigen DPA-status opvragen ───────────────────────────────────

  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { dpaAcceptedVersion: true, dpaAcceptedAt: true },
    })

    const accepted = user?.dpaAcceptedVersion === DPA_VERSION

    return {
      accepted,
      acceptedVersion: user?.dpaAcceptedVersion ?? null,
      acceptedAt: user?.dpaAcceptedAt?.toISOString() ?? null,
      currentVersion: DPA_VERSION,
      needsAcceptance: !accepted,
    }
  }),

  // ── Patiënt: DPA accepteren ───────────────────────────────────────────────

  accept: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        dpaAcceptedVersion: DPA_VERSION,
        dpaAcceptedAt: new Date(),
      },
    })
    // Cache-invalidatie: anders houdt de tRPC-DPA-gate (protectedProcedure) de
    // patiënt tot 60s tegen op basis van de oude, gecachte dpaAcceptedVersion.
    invalidateUserCache(ctx.user.supabaseUserId)
    return { accepted: true, version: DPA_VERSION }
  }),

  // ── Admin: DPA-overzicht van de héle praktijk ────────────────────────────
  //
  // Alleen ADMIN — therapeuten hoeven dit compliance-overzicht niet te zien.
  // Scope = praktijk-breed en beide DPA-plichtige rollen (PATIENT + ATHLETE),
  // niet meer versmald tot de eigen therapeut-koppeling. Zo klopt het totaal
  // met de werkelijke populatie i.p.v. alleen je eigen gekoppelde patiënten.
  listPatients: adminProcedure.query(async ({ ctx }) => {
    const patients = await ctx.prisma.user.findMany({
      where: {
        role: { in: ['PATIENT', 'ATHLETE'] },
        // Multi-tenant: beperk tot de eigen praktijk. Admin zonder praktijk
        // (globale beheerder) ziet alles.
        ...(ctx.user.practiceId ? { practiceId: ctx.user.practiceId } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        dpaAcceptedVersion: true,
        dpaAcceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return patients.map(p => ({
      id: p.id,
      name: p.name ?? 'Onbekend',
      email: p.email,
      role: p.role,
      dpaAcceptedVersion: p.dpaAcceptedVersion ?? null,
      dpaAcceptedAt: p.dpaAcceptedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      accepted: p.dpaAcceptedVersion === DPA_VERSION,
    }))
  }),
})
