/**
 * Hashtag-router: klacht-/aandachts-tags uit workout- en cardio-notities.
 *
 * Toegangsmodel:
 *   - Patiënt/atleet: alleen eigen tags (protectedProcedure, target = self).
 *   - Therapeut: tags van patiënten via behandelrelatie OF zelfde praktijk
 *     (zelfde regels als patients.ts); inzage wordt ge-audit (Wabvpz).
 *   - Woordenlijst (TagVocabularyItem): praktijk-breed, zelfde scope-patroon
 *     als de test-library (NULL = globale seed, gevuld = eigen praktijk).
 *
 * Episode-regel: usages met > 3 maanden gap horen niet meer bij elkaar —
 * groepering gebeurt in `groupIntoEpisodes` (@/lib/tags), gedeeld met iOS.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, therapistProcedure } from '@/server/trpc'
import { auditLog } from '@/server/audit'
import { groupIntoEpisodes, normalizeTag } from '@/lib/tags'

const createId = () => crypto.randomUUID()

async function assertTagAccess(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (patientId === user.id) return
  if (user.role === 'ADMIN') return
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot deze patiënt' })
  }
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
        ...(user.practiceId ? [{ practiceId: user.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot deze patiënt' })
}

/** Inzage in andermans tags (gezondheidsdata) ge-audit, zoals wearables.forPatient. */
async function auditIfForeign(
  ctx: { user: { id: string; email: string }; req?: unknown },
  patientId: string,
  route: string,
) {
  if (patientId === ctx.user.id) return
  await auditLog({
    event: 'PATIENT_VIEWED',
    userId: ctx.user.id,
    actorEmail: ctx.user.email,
    resource: 'User',
    resourceId: patientId,
    metadata: { route },
    req: ctx.req as never,
  })
}

export const tagsRouter = createTRPCRouter({
  /**
   * Suggesties voor de invoer-UI (zodra iemand # typt): eigen tags van de
   * patiënt + de praktijk-woordenlijst. Client filtert live; lijsten zijn
   * klein dus we sturen ze compleet.
   */
  suggest: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const patientId = input?.patientId ?? ctx.user.id
      await assertTagAccess(ctx.prisma, ctx.user, patientId)

      const [tags, patient] = await Promise.all([
        ctx.prisma.hashTag.findMany({
          where: { patientId },
          select: {
            id: true,
            name: true,
            display: true,
            usages: { select: { loggedAt: true }, orderBy: { loggedAt: 'desc' }, take: 1 },
          },
        }),
        ctx.prisma.user.findUnique({ where: { id: patientId }, select: { practiceId: true } }),
      ])

      const vocabulary = await ctx.prisma.tagVocabularyItem.findMany({
        where: { OR: [{ practiceId: null }, ...(patient?.practiceId ? [{ practiceId: patient.practiceId }] : [])] },
        select: { name: true, display: true },
        orderBy: { display: 'asc' },
      })

      const tagList = tags
        .map(t => ({
          id: t.id,
          name: t.name,
          display: t.display,
          lastUsedAt: t.usages[0]?.loggedAt.toISOString() ?? null,
        }))
        .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))

      // Woordenlijst zonder items die al als eigen tag bestaan.
      const own = new Set(tagList.map(t => t.name))
      return { tags: tagList, vocabulary: vocabulary.filter(v => !own.has(v.name)) }
    }),

  /** Tag-overzicht van een patiënt: huidige episode + historie-samenvatting. */
  list: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const patientId = input?.patientId ?? ctx.user.id
      await assertTagAccess(ctx.prisma, ctx.user, patientId)
      await auditIfForeign(ctx, patientId, 'tags.list')

      const tags = await ctx.prisma.hashTag.findMany({
        where: { patientId },
        select: {
          id: true,
          name: true,
          display: true,
          usages: { select: { loggedAt: true } },
        },
      })

      return tags
        .filter(t => t.usages.length > 0)
        .map(t => {
          const episodes = groupIntoEpisodes(t.usages)
          const current = episodes[0]
          return {
            id: t.id,
            name: t.name,
            display: t.display,
            usageCount: t.usages.length,
            lastUsedAt: current[0].loggedAt.toISOString(),
            currentEpisode: {
              count: current.length,
              from: current[current.length - 1].loggedAt.toISOString(),
              to: current[0].loggedAt.toISOString(),
            },
            previousEpisodeCount: episodes.length - 1,
          }
        })
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    }),

  /**
   * Tijdlijn van één tag, gegroepeerd in episodes (nieuwste eerst). De
   * huidige episode beantwoordt "welke workouts kregen deze tag"; oudere
   * episodes (> 3 maanden gap) blijven apart zichtbaar als context.
   */
  timeline: protectedProcedure
    .input(z.object({ tagId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tag = await ctx.prisma.hashTag.findUnique({
        where: { id: input.tagId },
        select: {
          id: true,
          name: true,
          display: true,
          patientId: true,
          usages: {
            select: {
              id: true,
              loggedAt: true,
              taggedById: true,
              sessionLog: {
                select: {
                  id: true,
                  duration: true,
                  exertionLevel: true,
                  painLevel: true,
                  therapistId: true,
                  patientId: true,
                  program: { select: { name: true } },
                },
              },
              cardioLog: {
                select: { id: true, activity: true, durationSec: true, rpe: true, painLevel: true },
              },
            },
          },
        },
      })
      if (!tag) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTagAccess(ctx.prisma, ctx.user, tag.patientId)
      await auditIfForeign(ctx, tag.patientId, 'tags.timeline')

      const flat = tag.usages.map(u => ({
        id: u.id,
        loggedAt: u.loggedAt.toISOString(),
        source: u.cardioLog ? ('cardio' as const) : ('session' as const),
        label: u.cardioLog
          ? u.cardioLog.activity
          : (u.sessionLog?.program?.name ?? 'Krachttraining'),
        // Zelf gelogd of door de therapeut (voor het "wie"-labeltje).
        byTherapist:
          !!u.sessionLog?.therapistId && u.sessionLog.therapistId !== u.sessionLog.patientId,
        durationSec: u.cardioLog?.durationSec ?? u.sessionLog?.duration ?? null,
        rpe: u.cardioLog?.rpe ?? u.sessionLog?.exertionLevel ?? null,
        painLevel: u.cardioLog?.painLevel ?? u.sessionLog?.painLevel ?? null,
        sessionLogId: u.sessionLog?.id ?? null,
        cardioLogId: u.cardioLog?.id ?? null,
      }))

      const episodes = groupIntoEpisodes(flat).map((usages, i) => ({
        current: i === 0,
        from: usages[usages.length - 1].loggedAt,
        to: usages[0].loggedAt,
        usages,
      }))

      return { id: tag.id, name: tag.name, display: tag.display, patientId: tag.patientId, episodes }
    }),

  // ── Praktijk-woordenlijst (beheer door therapeuten) ──────────────────────

  vocabulary: therapistProcedure.query(async ({ ctx }) => {
    return ctx.prisma.tagVocabularyItem.findMany({
      where: { OR: [{ practiceId: null }, ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : [])] },
      select: { id: true, name: true, display: true, practiceId: true },
      orderBy: { display: 'asc' },
    })
  }),

  vocabularyAdd: therapistProcedure
    .input(z.object({ display: z.string().min(2).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const name = normalizeTag(input.display)
      if (name.length < 2) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Te korte tag' })
      }
      const practiceId = ctx.user.practiceId ?? null
      const existing = await ctx.prisma.tagVocabularyItem.findFirst({
        where: { name, OR: [{ practiceId: null }, { practiceId }] },
        select: { id: true },
      })
      if (existing) return existing
      return ctx.prisma.tagVocabularyItem.create({
        data: { id: createId(), practiceId, name, display: input.display.replace(/^#/, ''), creatorId: ctx.user.id },
        select: { id: true },
      })
    }),

  vocabularyRemove: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.tagVocabularyItem.findUnique({
        where: { id: input.id },
        select: { practiceId: true },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' })
      // Zelfde semantiek als de test-library: globale seeds zijn in de
      // single-clinic realiteit ook beheerbaar, verder alleen eigen praktijk.
      if (
        ctx.user.role !== 'ADMIN' &&
        item.practiceId !== null &&
        item.practiceId !== ctx.user.practiceId
      ) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.tagVocabularyItem.delete({ where: { id: input.id } })
      return { ok: true }
    }),
})
