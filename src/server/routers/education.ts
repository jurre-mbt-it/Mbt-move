import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, adminProcedure } from '@/server/trpc'
import { signEducationFile, removeEducationFile } from '@/lib/education/storage'

/**
 * Educatie-content (admin-beheerd, globaal zichtbaar).
 *
 * VOORLOPIG ALLEEN ADMIN: enkel admin-CRUD is geëxposed. De therapeut-
 * leesbibliotheek en de patiënt-surfacing (`forPatient`) volgen in Phase 2,
 * samen met de "Leer"-tab in de program-builder. Tot die tijd bouwen admins
 * eerst de content-catalogus op.
 *
 * PDF's liggen in een privé-bucket; we leveren ze als tijdelijke signed URL
 * (`fileUrl`) mee in de output. Video's gebruiken `videoUrl` direct.
 */

const BODY_REGIONS = [
  'KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY',
  'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT',
] as const

/** Zelfde auto-detectie als de Exercise-router. */
function detectVideoMediaType(url: string): 'YOUTUBE' | 'VIMEO' | 'UPLOAD' {
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) return 'YOUTUBE'
  if (/vimeo\.com/i.test(url)) return 'VIMEO'
  return 'UPLOAD'
}

type ResourceRow = {
  id: string
  title: string
  description: string | null
  format: 'VIDEO' | 'PDF'
  mediaType: string | null
  videoUrl: string | null
  filePath: string | null
  thumbnailUrl: string | null
  specialty: string | null
  bodyRegion: string[]
  tags: string[]
  isActive: boolean
  order: number
  createdAt: Date
  updatedAt: Date
}

/** Voeg een tijdelijke signed URL toe voor PDF-content. */
async function withFileUrl(row: ResourceRow) {
  const fileUrl = row.format === 'PDF' ? await signEducationFile(row.filePath) : null
  return { ...row, fileUrl }
}

const UpsertInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  format: z.enum(['VIDEO', 'PDF']),
  videoUrl: z.string().trim().url().max(1000).nullable().optional(),
  filePath: z.string().trim().max(500).nullable().optional(),
  thumbnailUrl: z.string().trim().url().max(1000).nullable().optional()
    .or(z.literal('').transform(() => null)),
  specialty: z.string().trim().max(60).nullable().optional()
    .or(z.literal('').transform(() => null)),
  bodyRegion: z.array(z.enum(BODY_REGIONS)).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).max(9999).default(0),
})

export const educationRouter = createTRPCRouter({
  // ── Admin: lijst (incl. inactieve) ──────────────────────────────────────
  adminList: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.educationalResource.findMany({
      orderBy: [{ specialty: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
    })
    return Promise.all(rows.map(withFileUrl))
  }),

  // ── Admin: beschikbare specialties (uit actieve rehab-protocollen) ──────
  protocolSpecialties: adminProcedure.query(async ({ ctx }) => {
    const protocols = await ctx.prisma.rehabProtocol.findMany({
      where: { isActive: true },
      select: { specialty: true, name: true },
      orderBy: { specialty: 'asc' },
      distinct: ['specialty'],
    })
    return protocols.map((p) => ({ specialty: p.specialty, exampleName: p.name }))
  }),

  // ── Admin: aanmaken / bijwerken ─────────────────────────────────────────
  adminUpsert: adminProcedure
    .input(UpsertInput)
    .mutation(async ({ ctx, input }) => {
      // Format-specifieke validatie
      if (input.format === 'VIDEO' && !input.videoUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Video-URL is verplicht voor video-content' })
      }
      if (input.format === 'PDF' && !input.filePath) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload een PDF voordat je opslaat' })
      }

      const mediaType = input.format === 'VIDEO' && input.videoUrl
        ? detectVideoMediaType(input.videoUrl)
        : null

      const data = {
        title: input.title,
        description: input.description ?? null,
        format: input.format,
        mediaType,
        videoUrl: input.format === 'VIDEO' ? input.videoUrl ?? null : null,
        filePath: input.format === 'PDF' ? input.filePath ?? null : null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        specialty: input.specialty ?? null,
        bodyRegion: input.bodyRegion,
        tags: input.tags,
        isActive: input.isActive,
        order: input.order,
      }

      if (input.id) {
        const existing = await ctx.prisma.educationalResource.findUnique({
          where: { id: input.id },
          select: { filePath: true },
        })
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
        // Oud PDF-bestand opruimen als het vervangen of weggehaald is.
        if (existing.filePath && existing.filePath !== data.filePath) {
          await removeEducationFile(existing.filePath)
        }
        return ctx.prisma.educationalResource.update({ where: { id: input.id }, data })
      }

      return ctx.prisma.educationalResource.create({
        data: { ...data, createdById: ctx.user!.id },
      })
    }),

  // ── Admin: verwijderen ──────────────────────────────────────────────────
  adminDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.educationalResource.findUnique({
        where: { id: input.id },
        select: { filePath: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.prisma.educationalResource.delete({ where: { id: input.id } })
      await removeEducationFile(existing.filePath)
      return { ok: true }
    }),
})
