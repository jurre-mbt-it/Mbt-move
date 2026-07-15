import { z } from 'zod'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { copyItemToDay, COPY_ITEM_INCLUDE } from './weekSchedules'
import { mondayKey, mondayKeyOf, addDaysKey, amsMidnight, isDateKey } from '@/lib/week-dates'

const createId = () => crypto.randomUUID()

/**
 * Plan-sjablonen: meerweekse behandelplannen die je vanaf een datum op de
 * kalender van een patiënt zet (TrainingPeaks-stijl "training plan").
 *
 * Een sjabloon is een WeekPlanTemplate-header plus N WeekSchedule-weken met
 * `isTemplate: true`, `patientId: null` en `weekNumber` 1..N. `apply` KOPIEERT
 * die weken naar echte data — er blijft geen levende link. Het sjabloon later
 * wijzigen raakt lopende patiënten dus niet. Zelfde contract als
 * `programs.duplicate`.
 */

// ── Scope ────────────────────────────────────────────────────────────────
/** Reads: globale seeds (practiceId NULL) + eigen praktijk. Zie testReports.ts. */
function practiceScope(practiceId: string | null) {
  return practiceId ? [{ practiceId: null }, { practiceId }] : [{ practiceId: null }]
}

/** Writes: globale seeds zijn in de single-clinic realiteit ook bewerkbaar. */
function assertCanEdit(
  user: { role: string; practiceId: string | null },
  tpl: { practiceId: string | null },
) {
  if (user.role === 'ADMIN') return
  if (tpl.practiceId === null) return
  if (user.practiceId && tpl.practiceId === user.practiceId) return
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot dit plan' })
}

async function assertPatientLink(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze patiënt' })
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
  if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze patiënt' })
}

// ── Datum-helpers ────────────────────────────────────────────────────────
// Rekenen gebeurt in kalenderdagen (YYYY-MM-DD) in NL-tijd, niet in UTC:
// startDate staat in de DB als NL-middernacht (bv. 2026-05-03T22:00Z = ma 4
// mei), dus UTC-normalisatie ziet een zondag en schuift een week terug.
// Zie lib/week-dates.ts.

/**
 * Waar begint week 1?
 *   anchor 'start' → de week waarin `anchorDate` valt.
 *   anchor 'event' → terugtellen: `anchorDate` (wedstrijd, terug-naar-veld)
 *                    valt in de LAATSTE week van het plan. Bij maandag-weken
 *                    kan de streefdatum niet exact de laatste dag zijn, dus
 *                    "valt in de laatste week" is het eerlijke contract.
 */
function planStartMondayKey(anchorKey: string, anchor: 'start' | 'event', weeks: number): string {
  const m = mondayKey(anchorKey)
  return anchor === 'start' ? m : addDaysKey(m, -(weeks - 1) * 7)
}

// ── Zod ──────────────────────────────────────────────────────────────────
const anchorEnum = z.enum(['start', 'event'])
const modeEnum = z.enum(['merge', 'replace'])

export const planTemplatesRouter = createTRPCRouter({
  /** Sjablonen van eigen praktijk + globale seeds, met korte samenvatting. */
  list: therapistProcedure.query(async ({ ctx }) => {
    const templates = await ctx.prisma.weekPlanTemplate.findMany({
      where: { OR: practiceScope(ctx.user.practiceId) },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        schedules: {
          orderBy: { weekNumber: 'asc' },
          select: {
            weekNumber: true,
            phaseType: true,
            isDeload: true,
            targetLoad: true,
            days: {
              orderBy: { dayOfWeek: 'asc' },
              select: {
                dayOfWeek: true,
                items: { select: { id: true, quickCategory: true, programId: true } },
              },
            },
          },
        },
      },
    })
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      goal: t.goal,
      weeks: t.weeks,
      practiceId: t.practiceId,
      isGlobalSeed: t.practiceId === null,
      sessionCount: t.schedules.reduce(
        (sum, s) => sum + s.days.reduce((d, day) => d + day.items.length, 0),
        0,
      ),
      // Compacte preview: per week de gevulde dagen + fase.
      weekPreview: t.schedules.map(s => ({
        weekNumber: s.weekNumber,
        phaseType: s.phaseType,
        isDeload: s.isDeload,
        targetLoad: s.targetLoad,
        filledDays: s.days.filter(d => d.items.length > 0).map(d => d.dayOfWeek),
      })),
    }))
  }),

  /** Volledig sjabloon incl. weken/dagen/items — voor beheer en preview. */
  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findFirst({
        where: { id: input.id, OR: practiceScope(ctx.user.practiceId) },
        include: {
          schedules: {
            orderBy: { weekNumber: 'asc' },
            include: {
              days: {
                orderBy: { dayOfWeek: 'asc' },
                include: {
                  items: {
                    omit: { cardioParams: true },
                    orderBy: { order: 'asc' },
                    include: { program: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
        },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      return tpl
    }),

  /**
   * Sla een kalenderbereik van een patiënt op als herbruikbaar plan.
   *
   * Ankert op DATUM, niet op weekNumber. In de praktijk is `weekNumber` bijna
   * altijd 1 (er is geen unique-constraint en de planner zet 'm niet op), en
   * meerdere schedules delen hetzelfde nummer. De kalender is date-keyed, dus
   * dit is ook de enige betrouwbare sleutel. Schedules die dezelfde maandag
   * delen worden samengevoegd tot één sjabloon-week.
   */
  saveFromWeeks: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      /** ISO-dagen (YYYY-MM-DD); de maandagen eromheen bepalen het bereik. */
      fromDate: z.string(),
      toDate: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      goal: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)

      if (!isDateKey(input.fromDate) || !isDateKey(input.toDate)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ongeldige datum' })
      }
      const fromMonday = mondayKey(input.fromDate)
      const toMonday = mondayKey(input.toDate)
      if (toMonday < fromMonday) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Einddatum ligt voor de startdatum' })
      }

      const all = await ctx.prisma.weekSchedule.findMany({
        where: {
          patientId: input.patientId,
          isTemplate: false,
          startDate: { not: null },
        },
        orderBy: { startDate: 'asc' },
        include: {
          days: {
            orderBy: { dayOfWeek: 'asc' },
            include: {
              items: { orderBy: { order: 'asc' }, include: COPY_ITEM_INCLUDE },
            },
          },
        },
      })

      // Groepeer op maandag; duplicaat-schedules op dezelfde maandag smelten
      // samen tot één sjabloon-week.
      type Src = (typeof all)[number]
      const byMonday = new Map<string, Src[]>()
      for (const ws of all) {
        const m = mondayKeyOf(ws.startDate!)
        if (m < fromMonday || m > toMonday) continue
        const bucket = byMonday.get(m)
        if (bucket) bucket.push(ws)
        else byMonday.set(m, [ws])
      }
      // Elke maandag in het bereik krijgt een sjabloon-week, óók als er niets
      // staat. Voorheen liepen we alleen over de weken die een rij hadden: een
      // bewust lege week (rust) verdween dan, en alle weken erna schoven een
      // week op — de periodisering veranderde stil. Het aantal weken klopt nu
      // ook met wat de dialoog toont.
      const mondays: string[] = []
      for (let m = fromMonday; m <= toMonday; m = addDaysKey(m, 7)) mondays.push(m)
      if (mondays.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Leeg bereik' })
      }
      if (byMonday.size === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen weken met inhoud in dit bereik' })
      }

      const templateId = createId()
      await ctx.prisma.$transaction(async tx => {
        await tx.weekPlanTemplate.create({
          data: {
            id: templateId,
            name: input.name,
            description: input.description ?? null,
            goal: input.goal ?? null,
            weeks: mondays.length,
            creatorId: ctx.user.id,
            practiceId: ctx.user.practiceId ?? null,
          },
        })

        for (const [i, key] of mondays.entries()) {
          const group = byMonday.get(key) ?? []
          // Meta van de eerste rij die iets ingevuld heeft; een lege week heeft
          // niets en wordt gewoon een lege sjabloon-week.
          const meta = group.find(g => g.phaseType || g.isDeload || g.targetLoad != null || g.weekNote) ?? group[0] ?? null

          const weekId = createId()
          await tx.weekSchedule.create({
            data: {
              id: weekId,
              name: `${input.name} · week ${i + 1}`,
              creatorId: ctx.user.id,
              practiceId: ctx.user.practiceId ?? null,
              patientId: null,
              isTemplate: true,
              planTemplateId: templateId,
              weekNumber: i + 1,
              // Periodisering hoort bij het plan en gaat mee.
              phaseType: meta?.phaseType ?? null,
              isDeload: meta?.isDeload ?? false,
              targetLoad: meta?.targetLoad ?? null,
              weekNote: meta?.weekNote ?? null,
            },
          })

          // Dagen samenvoegen over de duplicaat-schedules heen.
          for (let dow = 0; dow < 7; dow++) {
            const srcDays = group.flatMap(g => g.days.filter(d => d.dayOfWeek === dow))
            const items = srcDays.flatMap(d => d.items)
            const dayId = createId()
            await tx.weekScheduleDay.create({
              data: { id: dayId, weekScheduleId: weekId, dayOfWeek: dow },
            })
            let order = 0
            for (const it of items) {
              // Gedeelde kopieerfunctie: draagt kind, activiteit, testbatterij,
              // geplande belasting, cardioParams én het voorschrift mee. Elk
              // nieuw itemveld hoort daar thuis, niet hier.
              await copyItemToDay(tx, it, dayId, order++)
            }
          }
        }
      }, { timeout: 30_000 })

      return { id: templateId, weeks: mondays.length }
    }),

  /**
   * Plaats een sjabloon op de kalender van een patiënt vanaf een datum.
   * Kopie, geen link. Retourneert wat er feitelijk is gebeurd zodat de UI niet
   * hoeft te gokken.
   *
   * Heet bewust niet `apply`: dat is een gereserveerd woord in tRPC-routers
   * (botst met Function.prototype.apply) en laat de router al bij het opbouwen
   * crashen.
   */
  applyToPatient: therapistProcedure
    .input(z.object({
      templateId: z.string(),
      patientId: z.string(),
      /** ISO-datum (YYYY-MM-DD). Betekenis hangt af van `anchor`. */
      anchorDate: z.string(),
      anchor: anchorEnum.default('start'),
      mode: modeEnum.default('merge'),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)

      const tpl = await ctx.prisma.weekPlanTemplate.findFirst({
        where: { id: input.templateId, OR: practiceScope(ctx.user.practiceId) },
        include: {
          schedules: {
            orderBy: { weekNumber: 'asc' },
            include: {
              days: {
                orderBy: { dayOfWeek: 'asc' },
                include: {
                  items: { orderBy: { order: 'asc' }, include: COPY_ITEM_INCLUDE },
                },
              },
            },
          },
        },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan niet gevonden' })
      if (tpl.schedules.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dit plan heeft geen weken' })
      }

      if (!isDateKey(input.anchorDate)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ongeldige datum' })
      }
      const startMonday = planStartMondayKey(input.anchorDate, input.anchor, tpl.schedules.length)

      // Bestaande weken van deze patiënt ophalen om op startDate te matchen.
      // weekNumber is per-patiënt en zegt niets over de kalender, dus we
      // ankeren op de maandag-datum.
      //
      // Zelfde scope-filter als duplicateWeek: alleen weken van jezelf of je
      // eigen praktijk. Zonder dit zou replace-mode de weken van een
      // mede-behandelende therapeut uit een ándere praktijk wissen (deleteMany
      // op de gevonden week), en merge-mode diens fase/deload overschrijven.
      const isAdmin = ctx.user.role === 'ADMIN'
      const practiceId = ctx.user.practiceId ?? null
      const accessibleScopeFilter = isAdmin
        ? {}
        : {
            OR: [
              { creatorId: ctx.user.id },
              ...(practiceId ? [{ practiceId }] : []),
            ],
          }
      const existing = await ctx.prisma.weekSchedule.findMany({
        where: { patientId: input.patientId, isTemplate: false, ...accessibleScopeFilter },
        select: { id: true, startDate: true, weekNumber: true },
      })
      const byMonday = new Map<string, { id: string; weekNumber: number }>()
      let maxWeekNumber = 0
      for (const w of existing) {
        maxWeekNumber = Math.max(maxWeekNumber, w.weekNumber)
        if (!w.startDate) continue
        const key = mondayKeyOf(w.startDate)
        if (!byMonday.has(key)) byMonday.set(key, { id: w.id, weekNumber: w.weekNumber })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { name: true, email: true },
      })
      const label = patient?.name ?? patient?.email ?? 'Patiënt'

      let placedItems = 0
      let createdWeeks = 0
      let replacedWeeks = 0
      let nextWeekNumber = maxWeekNumber

      await ctx.prisma.$transaction(async tx => {
        for (const [i, src] of tpl.schedules.entries()) {
          const weekStartKey = addDaysKey(startMonday, i * 7)
          // NL-middernacht, dezelfde vorm als bestaande startDate-waarden.
          const weekStart = amsMidnight(weekStartKey)
          const hit = byMonday.get(weekStartKey)

          let targetId: string
          if (hit) {
            targetId = hit.id
            if (input.mode === 'replace') {
              // Cascade ruimt items + item-exercises op.
              await tx.weekScheduleDay.deleteMany({ where: { weekScheduleId: targetId } })
              replacedWeeks++
            }
            await tx.weekSchedule.update({
              where: { id: targetId },
              data: {
                phaseType: src.phaseType,
                isDeload: src.isDeload,
                targetLoad: src.targetLoad,
                weekNote: src.weekNote,
                startDate: weekStart,
              },
            })
          } else {
            targetId = createId()
            nextWeekNumber++
            await tx.weekSchedule.create({
              data: {
                id: targetId,
                name: `${tpl.name} · week ${i + 1}`,
                creatorId: ctx.user.id,
                practiceId: ctx.user.practiceId ?? null,
                patientId: input.patientId,
                isTemplate: false,
                // Bewust GEEN planTemplateId: dit is een kopie, geen link.
                weekNumber: nextWeekNumber,
                startDate: weekStart,
                endDate: amsMidnight(addDaysKey(weekStartKey, 6)),
                phaseType: src.phaseType,
                isDeload: src.isDeload,
                targetLoad: src.targetLoad,
                weekNote: src.weekNote,
              },
            })
            createdWeeks++
          }

          // Dagen: hergebruiken waar ze al bestaan, anders aanmaken.
          const existingDays = await tx.weekScheduleDay.findMany({
            where: { weekScheduleId: targetId },
            select: { id: true, dayOfWeek: true },
            orderBy: { dayOfWeek: 'asc' },
          })
          const dayIdByDow = new Map<number, string>()
          for (const d of existingDays) {
            if (!dayIdByDow.has(d.dayOfWeek)) dayIdByDow.set(d.dayOfWeek, d.id)
          }

          for (const srcDay of src.days) {
            let dayId = dayIdByDow.get(srcDay.dayOfWeek)
            if (!dayId) {
              dayId = createId()
              await tx.weekScheduleDay.create({
                data: { id: dayId, weekScheduleId: targetId, dayOfWeek: srcDay.dayOfWeek },
              })
              dayIdByDow.set(srcDay.dayOfWeek, dayId)
            }
            // merge = achteraan toevoegen, dus bestaande order respecteren.
            const last = await tx.weekScheduleDayItem.findFirst({
              where: { dayId },
              orderBy: { order: 'desc' },
              select: { order: true },
            })
            let order = last ? last.order + 1 : 0
            for (const it of srcDay.items) {
              await copyItemToDay(tx, it, dayId, order++)
              placedItems++
            }
            // Legacy kolom afleiden zodat de iOS-app deze weken ook ziet.
            const firstProgramItem = await tx.weekScheduleDayItem.findFirst({
              where: { dayId, programId: { not: null } },
              orderBy: { order: 'asc' },
              select: { programId: true },
            })
            await tx.weekScheduleDay.update({
              where: { id: dayId },
              data: { programId: firstProgramItem?.programId ?? null },
            })
          }
        }
      }, { timeout: 30_000 })

      return {
        planName: tpl.name,
        patientLabel: label,
        weeks: tpl.schedules.length,
        startDate: startMonday,
        endDate: addDaysKey(startMonday, (tpl.schedules.length - 1) * 7 + 6),
        createdWeeks,
        replacedWeeks,
        placedItems,
      }
    }),

  update: therapistProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      goal: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: input.id },
        select: { practiceId: true },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      const { id, ...data } = input
      return ctx.prisma.weekPlanTemplate.update({ where: { id }, data })
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: input.id },
        select: { practiceId: true },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      // Cascade ruimt de sjabloon-weken op.
      return ctx.prisma.weekPlanTemplate.delete({ where: { id: input.id } })
    }),
})
