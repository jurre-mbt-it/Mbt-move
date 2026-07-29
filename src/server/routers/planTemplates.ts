import { z } from 'zod'
import { createTRPCRouter, coachStaffProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { planScope } from '@/server/lib/plan-access'
import type { PrismaClient } from '@prisma/client'
import { copyItemToDay, COPY_ITEM_INCLUDE } from './weekSchedules'
import { mondayKey, mondayKeyOf, addDaysKey, amsMidnight, isDateKey } from '@/lib/week-dates'
import { notifyNewSchedule } from '@/server/push/notify'

const createId = () => crypto.randomUUID()

/** Zelfde bovengrens als `createEmpty`. */
const MAX_PLAN_WEKEN = 24

/**
 * Weeknummers weer 1..N maken en de weeknamen erop laten aansluiten.
 *
 * Na invoegen of verwijderen zitten er gaten of dubbelingen in de nummering, en
 * de namen (`"<plan>, week 3"`) wijzen dan naar de verkeerde plek. Dit trekt
 * allebei recht op basis van de bestaande volgorde, en is idempotent: opnieuw
 * draaien op een gezond plan verandert niets.
 *
 * `weekNumber` heeft geen unique-constraint (zie AGENTS.md), dus dit mag in één
 * pass zonder tijdelijke nummers.
 */
async function hernummerPlanWeken(
  prisma: PrismaClient,
  planTemplateId: string,
  planNaam: string,
): Promise<number> {
  const weken = await prisma.weekSchedule.findMany({
    where: { planTemplateId },
    orderBy: { weekNumber: 'asc' },
    select: { id: true, weekNumber: true, name: true },
  })
  const enkel = weken.length === 1
  const patches = weken.flatMap((w, i) => {
    const nummer = i + 1
    const naam = enkel ? planNaam : `${planNaam}, week ${nummer}`
    if (w.weekNumber === nummer && w.name === naam) return []
    return [prisma.weekSchedule.update({ where: { id: w.id }, data: { weekNumber: nummer, name: naam } })]
  })
  await prisma.$transaction([
    ...patches,
    // `weeks` op de header is een redundante teller; laat 'm nooit uit de pas
    // lopen met het echte aantal weken.
    prisma.weekPlanTemplate.update({ where: { id: planTemplateId }, data: { weeks: weken.length } }),
  ])
  return weken.length
}

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
/**
 * Reads: globale seeds (practiceId NULL) + eigen praktijk. Zie testReports.ts.
 *
 * Een COACH hoort niet bij een praktijk. Zonder eigen tak zou die alleen de
 * globale seeds zien en zouden zijn eigen plannen (die immers practiceId null
 * krijgen) bij álle praktijken opduiken. Daarom scopet een coach op zijn eigen
 * `creatorId`: globale seeds lezen mag, de rest is van hemzelf.
 */
const scopeFor = planScope

/**
 * Writes: globale seeds zijn in de single-clinic realiteit ook bewerkbaar door
 * een therapeut. Een coach mag uitsluitend zijn eigen plannen bewerken; anders
 * zou hij via de seed-tak de sjablonen van de praktijk kunnen aanpassen.
 *
 * Als boolean beschikbaar omdat `list` het per plan meestuurt: de UI mag geen
 * verwijderknop tonen die de server daarna weigert. Eén regel, twee plekken.
 */
function canEdit(
  user: { id: string; role: string; practiceId: string | null },
  tpl: { practiceId: string | null; creatorId?: string; creator?: { role: string } | null },
): boolean {
  if (user.role === 'ADMIN') return true
  if (user.role === 'COACH') return tpl.creatorId === user.id
  // Seed-tak, maar niet voor plannen van een coach: die zijn privé, ook al
  // hebben ze geen praktijk.
  //
  // Let op de eigenaarscheck: een therapeut ZONDER praktijk maakt zelf ook
  // plannen met practiceId null (createEmpty/saveFromWeeks schrijven
  // `practiceId: ctx.user.practiceId ?? null`). Zonder die check zijn die niet
  // te onderscheiden van een globale seed en kan een therapeut uit een ándere
  // praktijk ze bewerken of verwijderen — en `delete` cascadeert door naar de
  // weekschema's van het plan.
  if (tpl.practiceId === null && tpl.creator?.role !== 'COACH') {
    return user.practiceId !== null || tpl.creatorId === user.id
  }
  return !!user.practiceId && tpl.practiceId === user.practiceId
}

function assertCanEdit(
  user: { id: string; role: string; practiceId: string | null },
  tpl: { practiceId: string | null; creatorId?: string; creator?: { role: string } | null },
) {
  if (!canEdit(user, tpl)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot dit plan' })
  }
}

/**
 * Maakt de aanname van de seed-tak wáár bij de bron.
 *
 * `practiceId null` betekent twee dingen tegelijk: "globale seed, door iedereen
 * bewerkbaar" én "gemaakt door iemand zonder praktijk". Zolang beide kunnen
 * bestaan, leest het plan van een praktijkloze therapeut als seed en kan een
 * therapeut uit een ándere praktijk het bewerken of verwijderen (cascade over
 * de weekschema's). Een ADMIN mag zulke seeds wél maken — dat is de bedoelde
 * route — en een COACH is al afgeschermd via de creator-rolcheck in `canEdit`.
 */
function assertCanOwnPlan(user: { role: string; practiceId: string | null }) {
  if (user.role === 'THERAPIST' && !user.practiceId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Je account hangt nog niet aan een praktijk; vraag een beheerder je te koppelen.',
    })
  }
}

async function assertPatientLink(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  if (user.role !== 'THERAPIST' && user.role !== 'COACH') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze patiënt' })
  }
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
        // Praktijk-tak alleen voor therapeuten; een coach heeft geen praktijk.
        ...(user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []),
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
  list: coachStaffProcedure.query(async ({ ctx }) => {
    const templates = await ctx.prisma.weekPlanTemplate.findMany({
      where: { OR: scopeFor(ctx.user) },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        creator: { select: { role: true } },
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
      /** Van mij? Bepaalt of je 'm mag hernoemen of verwijderen. */
      isOwn: t.creatorId === ctx.user.id,
      /** Mag deze gebruiker het plan hernoemen of verwijderen? Zelfde regel als `update`/`delete`. */
      canEdit: canEdit(ctx.user, t),
      // Een coach-plan heeft óók practiceId null. Zonder de creator-check zou
      // een coach zijn eigen plannen als "globale seed" gelabeld zien.
      isGlobalSeed: t.practiceId === null && t.creatorId !== ctx.user.id,
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
  get: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findFirst({
        where: { id: input.id, OR: scopeFor(ctx.user) },
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
  /**
   * Een leeg plan met N sjabloon-weken. Hiermee kun je een schema bouwen
   * zónder het eerst op de kalender van een atleet te zetten: de weken zijn
   * gewone WeekSchedule-rijen met isTemplate = true en een planTemplateId, dus
   * de weekplanner kan ze bewerken en `applyToPatient` kan ze later kopiëren.
   */
  createEmpty: coachStaffProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      weeks: z.number().int().min(1).max(24).default(1),
      goal: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCanOwnPlan(ctx.user)
      const tpl = await ctx.prisma.weekPlanTemplate.create({
        data: {
          name: input.name.trim(),
          weeks: input.weeks,
          goal: input.goal?.trim() || null,
          description: input.description?.trim() || null,
          creatorId: ctx.user.id,
          // Coaches horen niet bij een praktijk; hun plannen blijven privé via
          // de creator-check in scopeFor().
          practiceId: ctx.user.practiceId ?? null,
        },
      })

      for (let w = 1; w <= input.weeks; w++) {
        await ctx.prisma.weekSchedule.create({
          data: {
            id: createId(),
            name: input.weeks === 1 ? input.name.trim() : `${input.name.trim()}, week ${w}`,
            isTemplate: true,
            weekNumber: w,
            planTemplateId: tpl.id,
            creatorId: ctx.user.id,
            practiceId: ctx.user.practiceId ?? null,
            days: {
              create: Array.from({ length: 7 }, (_, i) => ({ id: createId(), dayOfWeek: i })),
            },
          },
        })
      }

      return { id: tpl.id, name: tpl.name, weeks: input.weeks }
    }),

  saveFromWeeks: coachStaffProcedure
    .input(z.object({
      patientId: z.string(),
      /** ISO-dagen (YYYY-MM-DD); de maandagen eromheen bepalen het bereik. */
      fromDate: z.string(),
      toDate: z.string(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      goal: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCanOwnPlan(ctx.user)
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
  applyToPatient: coachStaffProcedure
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
        where: { id: input.templateId, OR: scopeFor(ctx.user) },
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

      // Meerweeks plan op de kalender gezet → één melding aan de patiënt (alleen
      // als er daadwerkelijk iets is aangemaakt of geplaatst).
      if (createdWeeks > 0 || placedItems > 0) {
        await notifyNewSchedule(input.patientId).catch(() => {})
      }

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

  update: coachStaffProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      goal: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: input.id },
        select: { practiceId: true, creatorId: true, creator: { select: { role: true } } },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      const { id, ...data } = input
      return ctx.prisma.weekPlanTemplate.update({ where: { id }, data })
    }),

  delete: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: input.id },
        select: { practiceId: true, creatorId: true, creator: { select: { role: true } } },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      // Cascade ruimt de sjabloon-weken op.
      return ctx.prisma.weekPlanTemplate.delete({ where: { id: input.id } })
    }),

  /**
   * Lege week ertussen zetten. `atWeekNumber` is de plek die de nieuwe week
   * krijgt; alles vanaf daar schuift een plaats op.
   */
  insertWeek: coachStaffProcedure
    .input(z.object({
      planTemplateId: z.string(),
      atWeekNumber: z.number().int().min(1).max(MAX_PLAN_WEKEN),
    }))
    .mutation(async ({ ctx, input }) => {
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: input.planTemplateId },
        select: {
          id: true, name: true, practiceId: true, creatorId: true,
          creator: { select: { role: true } },
          _count: { select: { schedules: true } },
        },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      if (tpl._count.schedules >= MAX_PLAN_WEKEN) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Een plan kan hoogstens ${MAX_PLAN_WEKEN} weken hebben.`,
        })
      }

      await ctx.prisma.$transaction([
        // Ruimte maken. Er is geen unique-constraint op (plan, weekNumber), dus
        // dit hoeft niet in twee passes met tijdelijke nummers.
        ctx.prisma.weekSchedule.updateMany({
          where: { planTemplateId: tpl.id, weekNumber: { gte: input.atWeekNumber } },
          data: { weekNumber: { increment: 1 } },
        }),
        ctx.prisma.weekSchedule.create({
          data: {
            id: createId(),
            name: `${tpl.name}, week ${input.atWeekNumber}`,
            isTemplate: true,
            weekNumber: input.atWeekNumber,
            planTemplateId: tpl.id,
            creatorId: ctx.user.id,
            practiceId: ctx.user.practiceId ?? null,
            // Alle zeven dagen meteen aanmaken, net als createEmpty: de editor
            // gaat ervan uit dat elke dag bestaat en heeft dus altijd een dayId
            // om items op te zetten.
            days: { create: Array.from({ length: 7 }, (_, i) => ({ id: createId(), dayOfWeek: i })) },
          },
        }),
      ])
      await hernummerPlanWeken(ctx.prisma, tpl.id, tpl.name)
      return { ok: true }
    }),

  /**
   * Week uit het plan halen; de weken erna schuiven op, zodat week 2 week 1
   * wordt. Verwijdert ook de items van die week (cascade via de dagen).
   */
  removeWeek: coachStaffProcedure
    .input(z.object({ weekScheduleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const week = await ctx.prisma.weekSchedule.findUnique({
        where: { id: input.weekScheduleId },
        select: { id: true, planTemplateId: true },
      })
      if (!week?.planTemplateId) throw new TRPCError({ code: 'NOT_FOUND' })
      const tpl = await ctx.prisma.weekPlanTemplate.findUnique({
        where: { id: week.planTemplateId },
        select: {
          id: true, name: true, practiceId: true, creatorId: true,
          creator: { select: { role: true } },
          _count: { select: { schedules: true } },
        },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEdit(ctx.user, tpl)
      // Een plan zonder weken is geen plan; dan hoor je het plan zelf te
      // verwijderen, en dat is een andere knop met een eigen bevestiging.
      if (tpl._count.schedules <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dit is de laatste week. Verwijder het hele plan als je het kwijt wilt.',
        })
      }

      await ctx.prisma.weekSchedule.delete({ where: { id: week.id } })
      await hernummerPlanWeken(ctx.prisma, tpl.id, tpl.name)
      return { ok: true }
    }),
})
