import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { PrismaClient, Prisma } from '@prisma/client'
import {
  createTRPCRouter,
  therapistProcedure,
  coachStaffProcedure,
  mfaCoachStaffProcedure,
  mfaTherapistProcedure,
  invalidateUserCache,
} from '@/server/trpc'
import { hasPatientAccess, practiceScope } from '@/server/lib/patient-access'
import {
  careScopeKey,
  careScopeWhere,
  careScopeWhereForRead,
  nietUitbehandeld,
  programmaScope,
  welUitbehandeld,
} from '@/server/lib/care-scope'
import { hefUitbehandeldOp } from '@/server/lib/care-reactivate'
import { werklijstAnd } from '@/server/lib/werklijst-where'
import { findOpenTracker, type TrackerClient } from '@/lib/rehab-data'
import { auditLog } from '@/server/audit'
import { amsMidnight, dateKey } from '@/lib/week-dates'
import { deriveTopSet, estimateOneRepMax } from '@/lib/one-rep-max'
import { clampSessionDurationSec, sessionLoad } from '@/lib/training-load'
import { syncHashtagsForLog } from '@/server/tags'

const createId = () => crypto.randomUUID()

// Onboarding-placeholder die bij invite.create wordt gezet en bij invite.finalize
// gewist hoort te worden. Self-heal in patients.list pikt rijen op die door een
// eerdere bug nog steeds met deze tekst rondlopen terwijl de patient al
// geaccepteerd heeft.
const PENDING_INVITE_NOTE = 'Aangemaakt via invite, wacht op acceptatie'

/**
 * Vertaal een botsing op een unieke index (Prisma P2002) naar een CONFLICT met
 * een melding waar de therapeut iets mee kan. Zonder deze vertaling komt de
 * rauwe databasefout bij de client terecht en toont de app alleen een algemene
 * "kon niet opslaan". Zelfde patroon als `alsConflict` in rehab.ts.
 *
 * Hier klappen de twee partiële indexen op patient_care_status
 * (patient_care_status_one_per_practice en _one_per_coach). Prisma kent die
 * niet, want `db push` negeert partiële indexen, dus een compound upsert kan
 * niet en dit is read-then-write: twee therapeuten die tegelijk archiveren
 * zien allebei "nog niet inactief" en de tweede insert botst.
 *
 * Sinds gereactiveerde rijen bewaard blijven staan die indexen op
 * `AND "reactivatedAt" IS NULL` (20260805_care_status_reactivated.sql). Een
 * botsing betekent daardoor nog steeds precies één ding: er staat al een
 * LOPENDE markering. De melding hieronder klopt dus ook met historie erbij;
 * een oude, afgesloten periode botst niet.
 */
const alsConflict = (bericht: string) => (err: unknown): never => {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  ) {
    throw new TRPCError({ code: 'CONFLICT', message: bericht })
  }
  throw err
}

const AL_INACTIEF =
  'Deze patiënt staat al op inactief. Ververs het scherm om de huidige status te zien.'

const TRAJECT_ALLEEN_THERAPEUT =
  'Het afsluiten van een revalidatietraject is aan de behandelend therapeut. Zet de atleet op inactief zonder dat vinkje, of vraag de therapeut het traject af te ronden.'

/**
 * Sluit het lopende rehab-traject van een patiënt mee af bij het archiveren.
 * Geeft het id van het gesloten traject terug, of null als er niets liep.
 *
 * Zet dezelfde velden als `rehab.closeTraject`, maar met `outcome: 'UNKNOWN'`:
 * dat de behandeling stopt zegt niets over hoe de revalidatie afliep, en de
 * therapeut kiest die uitkomst in dit formulier niet. `outcomeNote` blijft
 * ongemoeid; er is hier geen toelichting om weg te schrijven en overschrijven
 * zou alleen data kunnen wissen.
 *
 * Loopt er geen traject, dan gebeurt er niets. Dat is geen fout: het vinkje in
 * het archiveer-formulier is een wens, geen belofte dat er een traject is.
 *
 * Draait binnen de transactie van `setInactive`, vandaar `TrackerClient` in
 * plaats van de hele client. Faalt deze update, dan rolt de uitbehandel-rij
 * mee terug. Zonder dat zou de patiënt inactief staan met een fout in beeld,
 * en was de enige weg terug: heractiveren en opnieuw archiveren.
 *
 * De auditregel hoort niet hier maar bij de caller, náást PATIENT_DISCHARGED.
 * Twee handelingen, twee regels, anders is achteraf niet te zien of de
 * therapeut dit traject zelf sloot of dat het meeliep met het archiveren.
 */
async function closeOpenTrajectFor(
  tx: TrackerClient,
  patientId: string,
  closedById: string,
): Promise<string | null> {
  const tracker = await findOpenTracker(tx, patientId)
  if (!tracker) return null
  await tx.patientRehabTracker.update({
    where: { id: tracker.id },
    data: {
      deactivatedAt: new Date(),
      closedById,
      outcome: 'UNKNOWN',
    },
  })
  return tracker.id
}

/**
 * Toegang tot een patient = directe PatientTherapist-koppeling, OF dezelfde
 * praktijk als de patient (therapeut). Coaches: alleen directe koppeling.
 * De regel zelf staat in src/server/lib/patient-access.ts — niet dupliceren.
 */
export const patientsRouter = createTRPCRouter({
  /**
   * Werklijst met patiënten. `include` bepaalt welke kant van het archief je
   * ziet: standaard alleen wie nog in behandeling is.
   *
   * De input is met opzet OPTIONEEL. Deze procedure had er tot nu toe geen, en
   * de iOS-app (build 78, geen version-gate en geen OTA) roept 'm zonder
   * parameters aan. Een verplichte input zou die app breken.
   */
  list: coachStaffProcedure
    .input(
      z
        .object({
          include: z.enum(['active', 'archived', 'all']).default('active'),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Zichtbaar = directe koppeling (PatientTherapist) OF zelfde praktijk.
      // Dat laatste laat collega-therapeuten binnen één praktijk elkaars
      // patiënten zien zonder aparte invite.
      const me = ctx.user
      const include = input?.include ?? 'active'
      // Beide helpers gebruiken de leesvariant van de scope: een therapeut
      // zonder praktijk krijgt een filter dat niets matcht in plaats van een
      // foutmelding, en houdt dus gewoon zijn lijst.
      const archiefFilter: Prisma.UserWhereInput =
        include === 'all'
          ? {}
          : include === 'archived'
            ? welUitbehandeld(me)
            : nietUitbehandeld(me)

      // Self-heal stale onboarding-notes voor reeds geaccepteerde patiënten
      // van deze therapeut. Eén UPDATE per dashboard-load; raakt alleen rijen
      // die nog letterlijk de placeholder bevatten.
      await ctx.prisma.patientTherapist.updateMany({
        where: {
          therapistId: me.id,
          status: 'APPROVED',
          notes: PENDING_INVITE_NOTE,
        },
        data: { notes: null },
      })

      // Therapietrouw-window: laatste 14 dagen. Lage compliance = ≥ 3 geplande
      // sessies en < 60% afgerond. Threshold is bewust conservatief zodat
      // nieuwe patiënten met 1-2 sessies niet meteen 'low' zijn.
      const COMPLIANCE_WINDOW_DAYS = 14
      const COMPLIANCE_MIN_SCHEDULED = 3
      const COMPLIANCE_THRESHOLD = 0.6
      const since = new Date(Date.now() - COMPLIANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

      const patients = await ctx.prisma.user.findMany({
        where: {
          role: { in: ['PATIENT', 'ATHLETE'] },
          // `werklijstAnd` zet de scope-OR en het archieffilter naast elkaar
          // onder AND. Die vorm ligt vast in werklijst-where.test.ts.
          AND: werklijstAnd(
            [
              {
                patientTherapists: {
                  some: {
                    therapistId: me.id,
                    isActive: true,
                    status: { in: ['APPROVED', 'PENDING'] },
                  },
                },
              },
              ...practiceScope(me),
            ],
            archiefFilter,
          ),
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          phone: true,
          dateOfBirth: true,
          createdAt: true,
          role: true,
          // Alleen de LOPENDE markering van deze lezer. `careScopeWhereForRead`
          // bakt `reactivatedAt: null` in, dus historie van eerdere
          // afsluitingen blijft hier buiten. Maximaal één rij per scope
          // (partiële unieke index), vandaar take: 1.
          careStatuses: {
            where: careScopeWhereForRead(me),
            take: 1,
            select: { dischargedAt: true, reason: true },
          },
          patientPrograms: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              name: true,
              status: true,
              weeks: true,
              startDate: true,
              endDate: true,
            },
          },
          patientTherapists: {
            where: {
              therapistId: me.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
            take: 1,
            select: { status: true, notes: true },
          },
          sessionLogs: {
            where: { scheduledAt: { gte: since } },
            select: { completedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return patients.map(p => {
        const program = p.patientPrograms[0] ?? null
        const myRel = p.patientTherapists[0] ?? null
        const care = p.careStatuses[0] ?? null
        const initials = (p.name ?? p.email)
          .split(' ')
          .map(w => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)

        const scheduled = p.sessionLogs.length
        const completed = p.sessionLogs.filter(s => s.completedAt !== null).length
        const compliancePercent = scheduled > 0 ? completed / scheduled : null
        const complianceLow =
          scheduled >= COMPLIANCE_MIN_SCHEDULED &&
          compliancePercent !== null &&
          compliancePercent < COMPLIANCE_THRESHOLD

        return {
          accessStatus: myRel?.status ?? 'APPROVED',
          id: p.id,
          role: p.role,
          name: p.name ?? p.email,
          email: p.email,
          phone: p.phone,
          avatarInitials: initials,
          dateOfBirth: p.dateOfBirth,
          createdAt: p.createdAt,
          // null = in behandeling. Gevuld = uitbehandeld door deze praktijk of
          // deze coach; alleen zichtbaar bij include 'archived' of 'all'.
          dischargedAt: care?.dischargedAt ?? null,
          dischargeReason: care?.reason ?? null,
          notes: myRel?.notes ?? null,
          programId: program?.id ?? null,
          programName: program?.name ?? null,
          programStatus: program?.status ?? null,
          weeksTotal: program?.weeks ?? 0,
          startDate: program?.startDate,
          endDate: program?.endDate,
          // Therapietrouw afgelopen 14 dagen
          compliancePercent,
          complianceLow,
          complianceScheduled: scheduled,
          complianceCompleted: completed,
        }
      })
    }),

  /**
   * Caseload voor de patiëntenlijst: dezelfde patiënten als `list`, plus per
   * patiënt de belasting per week, de laatste pijnscore mét richting en het
   * moment van de laatste activiteit.
   *
   * Bewust een aparte procedure. `list` voedt ook pickers, de weekplanner en
   * het dashboard; die hoeven dit rekenwerk niet te dragen. En bewust één
   * gebatchte call in plaats van `loadCurve` per rij: dat zou bij dertig
   * patiënten dertig queries afvuren bij het openen van de pagina.
   *
   * De weekgrens komt van de client (maandag 00:00 lokaal) zodat de server geen
   * tijdzone-aannames doet — zelfde patroon als `therapistDashboard`.
   */
  caseload: coachStaffProcedure
    .input(z.object({
      weekStart: z.string(),
      weeks: z.number().int().min(4).max(12).default(6),
    }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user
      const DAY = 24 * 60 * 60 * 1000
      const weekStart = new Date(input.weekStart)
      if (Number.isNaN(weekStart.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ongeldige weekgrens.' })
      }
      const weeks = input.weeks
      const windowStart = new Date(weekStart.getTime() - (weeks - 1) * 7 * DAY)
      const windowEnd = new Date(weekStart.getTime() + 7 * DAY)

      // Scope gelijk aan `list`: eigen koppeling óf dezelfde praktijk, en
      // zonder lopende uitbehandel-markering. Dat archieffilter staat als
      // aparte AND-tak naast de scope-OR en nooit als tweede `OR`-sleutel.
      const patients = await ctx.prisma.user.findMany({
        where: {
          role: { in: ['PATIENT', 'ATHLETE'] },
          AND: werklijstAnd(
            [
              {
                patientTherapists: {
                  some: {
                    therapistId: me.id,
                    isActive: true,
                    status: { in: ['APPROVED', 'PENDING'] },
                  },
                },
              },
              ...practiceScope(me),
            ],
            nietUitbehandeld(me),
          ),
        },
        select: { id: true },
      })
      const ids = patients.map(p => p.id)
      if (ids.length === 0) return []

      const painSince = new Date(Date.now() - 60 * DAY)

      const [strengthLogs, cardioLogs, lastStrength, lastCardio, painEntries] = await Promise.all([
        ctx.prisma.sessionLog.findMany({
          where: {
            patientId: { in: ids },
            status: 'COMPLETED',
            completedAt: { gte: windowStart, lt: windowEnd },
          },
          select: { patientId: true, completedAt: true, duration: true, exertionLevel: true },
        }),
        ctx.prisma.cardioLog.findMany({
          where: { patientId: { in: ids }, completedAt: { gte: windowStart, lt: windowEnd } },
          select: { patientId: true, completedAt: true, durationSec: true, rpe: true },
        }),
        // Laatste activiteit staat los van het venster: iemand die drie maanden
        // stil is, moet "90 dagen" tonen en niet "nooit".
        ctx.prisma.sessionLog.groupBy({
          by: ['patientId'],
          where: { patientId: { in: ids }, status: 'COMPLETED', completedAt: { not: null } },
          _max: { completedAt: true },
        }),
        ctx.prisma.cardioLog.groupBy({
          by: ['patientId'],
          where: { patientId: { in: ids } },
          _max: { completedAt: true },
        }),
        ctx.prisma.painEntry.findMany({
          where: { userId: { in: ids }, reportedAt: { gte: painSince } },
          select: { userId: true, nrs: true, reportedAt: true },
          orderBy: { reportedAt: 'desc' },
        }),
      ])

      /** In welke week-emmer valt dit moment? -1 = buiten het venster. */
      const bucketOf = (d: Date) =>
        Math.floor((d.getTime() - windowStart.getTime()) / (7 * DAY))

      const series = new Map<string, number[]>()
      const add = (patientId: string, at: Date | null, minutes: number, rpe: number | null) => {
        if (!at) return
        const b = bucketOf(at)
        if (b < 0 || b >= weeks) return
        const row = series.get(patientId) ?? Array<number>(weeks).fill(0)
        row[b] += sessionLoad(minutes, rpe)
        series.set(patientId, row)
      }
      for (const s of strengthLogs) {
        add(s.patientId, s.completedAt, clampSessionDurationSec(s.duration) / 60, s.exertionLevel)
      }
      for (const c of cardioLogs) {
        add(c.patientId, c.completedAt, clampSessionDurationSec(c.durationSec) / 60, c.rpe)
      }

      const lastById = new Map<string, Date>()
      for (const g of [...lastStrength, ...lastCardio]) {
        const at = g._max.completedAt
        if (!at) continue
        const cur = lastById.get(g.patientId)
        if (!cur || at > cur) lastById.set(g.patientId, at)
      }

      // Pijn: laatste score, plus de richting t.o.v. de twee weken ervóór.
      // ±2 op de NRS is de gangbare grens voor een verschil dat ertoe doet;
      // daarbinnen noemen we het stabiel in plaats van een trend te suggereren.
      const painByPatient = new Map<string, { nrs: number; at: Date; trend: 'up' | 'down' | 'flat' }>()
      const grouped = new Map<string, Array<{ nrs: number; at: Date }>>()
      for (const p of painEntries) {
        const arr = grouped.get(p.userId) ?? []
        arr.push({ nrs: p.nrs, at: p.reportedAt })
        grouped.set(p.userId, arr)
      }
      for (const [patientId, entries] of grouped) {
        const latest = entries[0]  // query is al aflopend gesorteerd
        const from = new Date(latest.at.getTime() - 14 * DAY)
        const before = entries.filter(e => e.at < latest.at && e.at >= from)
        let trend: 'up' | 'down' | 'flat' = 'flat'
        if (before.length > 0) {
          const mean = before.reduce((t, e) => t + e.nrs, 0) / before.length
          if (latest.nrs - mean >= 2) trend = 'up'
          else if (mean - latest.nrs >= 2) trend = 'down'
        }
        painByPatient.set(patientId, { nrs: latest.nrs, at: latest.at, trend })
      }

      return ids.map(id => {
        const row = series.get(id) ?? Array<number>(weeks).fill(0)
        const rounded = row.map(v => Math.round(v))
        const thisWeek = rounded[weeks - 1] ?? 0
        const prevWeek = rounded[weeks - 2] ?? 0
        return {
          patientId: id,
          series: rounded,
          weekLoad: thisWeek,
          /** Sprong t.o.v. vorige week in procenten. Null als er niets staat om
           *  mee te vergelijken — dan is een percentage betekenisloos. */
          weekChangePct:
            prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null,
          pain: painByPatient.get(id) ?? null,
          lastActivityAt: lastById.get(id) ?? null,
        }
      })
    }),

  get: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user
      const p = await ctx.prisma.user.findFirst({
        where: {
          id: input.id,
          role: { in: ['PATIENT', 'ATHLETE'] },
          OR: [
            {
              patientTherapists: {
                some: {
                  therapistId: me.id,
                  isActive: true,
                  status: { in: ['APPROVED', 'PENDING'] },
                },
              },
            },
            ...practiceScope(me),
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatarUrl: true,
          phone: true,
          dateOfBirth: true,
          createdAt: true,
          // Voor de traject-checklist: gezet zodra de patiënt de app heeft
          // geactiveerd en de verwerkersvoorwaarden accepteerde. Dit is de
          // betrouwbare "uitnodiging geaccepteerd"-marker; de placeholder-note
          // op de koppeling is wisbaar en geldt maar per relatie.
          dpaAcceptedAt: true,
          injuryInfo: true,
          injuryVisibleToTherapist: true,
          maxHeartRate: true,
          restingHeartRate: true,
          lthr: true,
          // Lopende uitbehandel-markering van DEZE lezer, voor de archiefbanner
          // op het detailscherm. Zelfde leesfilter als in `list`, dus historie
          // van eerdere afsluitingen blijft erbuiten en een account zonder
          // geldige scope krijgt gewoon niets in plaats van een foutmelding.
          careStatuses: {
            where: careScopeWhereForRead(me),
            take: 1,
            select: {
              dischargedAt: true,
              reason: true,
              note: true,
              dischargedBy: { select: { name: true, email: true } },
            },
          },
          patientPrograms: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              status: true,
              weeks: true,
              daysPerWeek: true,
              startDate: true,
              endDate: true,
            },
          },
          patientTherapists: {
            where: {
              therapistId: me.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
            take: 1,
            select: { status: true, notes: true },
          },
        },
      })

      if (!p) return null

      // NEN 7513 / Wabvpz: dossier-toegang door therapeut moet gelogd
      // worden. auditLog faalt silently, breekt de query nooit.
      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: me.id,
        actorEmail: me.email,
        resource: 'User',
        resourceId: p.id,
        metadata: { route: 'patients.get' },
        req: ctx.req,
      })

      const myRel = p.patientTherapists[0] ?? null
      const program = p.patientPrograms[0] ?? null
      const care = p.careStatuses[0] ?? null
      const initials = (p.name ?? p.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      return {
        id: p.id,
        accessStatus: myRel?.status ?? 'APPROVED',
        name: p.name ?? p.email,
        email: p.email,
        role: p.role,
        phone: p.phone,
        avatarInitials: initials,
        dateOfBirth: p.dateOfBirth,
        createdAt: p.createdAt,
        dpaAcceptedAt: p.dpaAcceptedAt,
        maxHeartRate: p.maxHeartRate,
        restingHeartRate: p.restingHeartRate,
        lthr: p.lthr,
        // Alleen tonen als patient ermee instemt
        injuryInfo: p.injuryVisibleToTherapist ? p.injuryInfo : null,
        // null = in behandeling. Gevuld = de lopende afsluiting van deze
        // praktijk of deze coach, met wie hem zette en waarom.
        careStatus: care
          ? {
              dischargedAt: care.dischargedAt,
              reason: care.reason,
              note: care.note,
              dischargedByName: care.dischargedBy.name ?? care.dischargedBy.email,
            }
          : null,
        notes: myRel?.notes ?? null,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
        programStatus: program?.status ?? null,
        weeksTotal: program?.weeks ?? 0,
        startDate: program?.startDate,
        endDate: program?.endDate,
        programs: p.patientPrograms,
      }
    }),

  // ── Belasting-curve van een patiënt (fitness-fatigue, kracht + cardio) ───
  loadCurve: coachStaffProcedure
    .input(z.object({
      patientId: z.string(),
      days: z.number().int().min(28).max(365).default(120),
    }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden of geen toegang.' })
      }
      const { computeLoadCurve } = await import('@/server/load-curve')
      return computeLoadCurve(ctx.prisma, input.patientId, input.days)
    }),

  /**
   * Aggregaat voor het therapeuten-dashboard: vandaag geplande sessies,
   * cross-patiënt activiteiten-feed, week-teller en stille patiënten — in
   * één call i.p.v. N per-patiënt queries. Scope = zelfde als patients.list
   * (directe koppeling OF zelfde praktijk).
   */
  therapistDashboard: coachStaffProcedure
    .input(z.object({
      // Lokale grenzen van de client — server doet geen tijdzone-aannames
      // (zelfde patroon als weekSchedules.sessionsInRange).
      dayStart: z.string(),  // ISO — vandaag 00:00 local
      weekStart: z.string(), // ISO — maandag 00:00 local
    }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user
      const DAY = 24 * 60 * 60 * 1000
      const dayStart = new Date(input.dayStart)
      const weekStart = new Date(input.weekStart)
      if (Number.isNaN(dayStart.getTime()) || Number.isNaN(weekStart.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ongeldige datumgrens.' })
      }
      const dayEnd = new Date(dayStart.getTime() + DAY)
      const weekEnd = new Date(weekStart.getTime() + 7 * DAY)
      const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY)
      const SILENT_DAYS = 7
      const silentSince = new Date(Date.now() - SILENT_DAYS * DAY)

      // Het dashboard toont bewust NIET de hele praktijk (zoals patients.list
      // doet), maar alleen patiënten waar déze therapeut zelf iets mee heeft
      // gedaan — een "engagement". Zo blijft het overzicht persoonlijk en
      // raken collega-patiënten je dashboard niet vol. Engagement =
      //   1. directe behandelrelatie (PatientTherapist), OF
      //   2. zelf een sessie voor de patiënt gelogd (SessionLog.therapistId), OF
      //   3. zelf een programma voor de patiënt gemaakt (Program.creatorId), OF
      //   4. zelf een weekschema voor de patiënt gemaakt (WeekSchedule.creatorId).
      //
      // Uitbehandelde patiënten vallen af. Het archieffilter staat als aparte
      // AND-tak naast de engagement-OR; een tweede `OR`-sleutel zou die hele
      // lijst met engagements wissen. Dit dekt meteen `silentPatients`
      // onderaan, dat uit dezelfde `patients` wordt afgeleid.
      const patients = await ctx.prisma.user.findMany({
        where: {
          role: { in: ['PATIENT', 'ATHLETE'] },
          AND: werklijstAnd(
            [
              {
                patientTherapists: {
                  some: {
                    therapistId: me.id,
                    isActive: true,
                    status: { in: ['APPROVED', 'PENDING'] },
                  },
                },
              },
              { sessionLogs: { some: { therapistId: me.id } } },
              { patientPrograms: { some: { creatorId: me.id } } },
              { patientWeekSchedules: { some: { creatorId: me.id } } },
            ],
            nietUitbehandeld(me),
          ),
        },
        select: {
          id: true,
          name: true,
          email: true,
          patientPrograms: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true },
          },
        },
      })
      const ids = patients.map(p => p.id)
      if (ids.length === 0) {
        return {
          todayPlanned: [],
          recentActivity: [],
          weekSessions: 0,
          prevWeekSessions: 0,
          silentPatients: [],
        }
      }
      const nameById = new Map(ids.map(id => {
        const p = patients.find(x => x.id === id)!
        return [id, p.name ?? p.email] as const
      }))

      const FEED_TAKE = 8
      const [
        todayPlannedRaw,
        weekStrength, weekCardio, prevStrength, prevCardio,
        feedStrength, feedCardio, feedWellness, feedPain,
        lastStrength, lastCardio, lastWellness, lastPain,
      ] = await Promise.all([
        ctx.prisma.sessionLog.findMany({
          where: { patientId: { in: ids }, scheduledAt: { gte: dayStart, lt: dayEnd } },
          select: {
            id: true,
            patientId: true,
            scheduledAt: true,
            completedAt: true,
            completedAll: true,
            program: { select: { name: true } },
          },
          orderBy: { scheduledAt: 'asc' },
        }),
        ctx.prisma.sessionLog.count({
          where: { patientId: { in: ids }, completedAt: { gte: weekStart, lt: weekEnd } },
        }),
        ctx.prisma.cardioLog.count({
          where: { patientId: { in: ids }, completedAt: { gte: weekStart, lt: weekEnd } },
        }),
        ctx.prisma.sessionLog.count({
          where: { patientId: { in: ids }, completedAt: { gte: prevWeekStart, lt: weekStart } },
        }),
        ctx.prisma.cardioLog.count({
          where: { patientId: { in: ids }, completedAt: { gte: prevWeekStart, lt: weekStart } },
        }),
        ctx.prisma.sessionLog.findMany({
          where: { patientId: { in: ids }, completedAt: { not: null } },
          select: {
            id: true,
            patientId: true,
            completedAt: true,
            exertionLevel: true,
            painLevel: true,
            feelScore: true,
            program: { select: { name: true } },
          },
          orderBy: { completedAt: 'desc' },
          take: FEED_TAKE,
        }),
        ctx.prisma.cardioLog.findMany({
          where: { patientId: { in: ids } },
          select: {
            id: true,
            patientId: true,
            completedAt: true,
            activity: true,
            durationSec: true,
            rpe: true,
          },
          orderBy: { completedAt: 'desc' },
          take: FEED_TAKE,
        }),
        ctx.prisma.wellnessCheck.findMany({
          where: { userId: { in: ids } },
          select: {
            id: true,
            userId: true,
            createdAt: true,
            sleep: true,
            fatigue: true,
            stress: true,
          },
          orderBy: { createdAt: 'desc' },
          take: FEED_TAKE,
        }),
        ctx.prisma.painEntry.findMany({
          where: { userId: { in: ids } },
          select: {
            id: true,
            userId: true,
            reportedAt: true,
            nrs: true,
            location: true,
          },
          orderBy: { reportedAt: 'desc' },
          take: FEED_TAKE,
        }),
        ctx.prisma.sessionLog.groupBy({
          by: ['patientId'],
          where: { patientId: { in: ids }, completedAt: { not: null } },
          _max: { completedAt: true },
        }),
        ctx.prisma.cardioLog.groupBy({
          by: ['patientId'],
          where: { patientId: { in: ids } },
          _max: { completedAt: true },
        }),
        ctx.prisma.wellnessCheck.groupBy({
          by: ['userId'],
          where: { userId: { in: ids } },
          _max: { createdAt: true },
        }),
        ctx.prisma.painEntry.groupBy({
          by: ['userId'],
          where: { userId: { in: ids } },
          _max: { reportedAt: true },
        }),
      ])

      type FeedItem = {
        id: string
        type: 'strength' | 'cardio' | 'wellness' | 'pain'
        at: Date
        patientId: string
        patientName: string
        detail: string
      }
      const fmtDuration = (sec: number) => `${Math.round(sec / 60)} min`
      const feed: FeedItem[] = [
        ...feedStrength.map((s): FeedItem => ({
          id: s.id,
          type: 'strength',
          at: s.completedAt!,
          patientId: s.patientId,
          patientName: nameById.get(s.patientId) ?? '—',
          detail: [
            s.program?.name ?? 'Losse krachtsessie',
            s.exertionLevel != null ? `RPE ${s.exertionLevel}` : null,
            s.painLevel != null && s.painLevel > 0 ? `pijn ${s.painLevel}/10` : null,
            s.feelScore != null ? `gevoel ${s.feelScore}/5` : null,
          ].filter(Boolean).join(' · '),
        })),
        ...feedCardio.map((c): FeedItem => ({
          id: c.id,
          type: 'cardio',
          at: c.completedAt,
          patientId: c.patientId,
          patientName: nameById.get(c.patientId) ?? '—',
          detail: [
            c.activity.toLowerCase(),
            fmtDuration(c.durationSec),
            c.rpe != null ? `RPE ${c.rpe}` : null,
          ].filter(Boolean).join(' · '),
        })),
        ...feedWellness.map((w): FeedItem => ({
          id: w.id,
          type: 'wellness',
          at: w.createdAt,
          patientId: w.userId,
          patientName: nameById.get(w.userId) ?? '—',
          detail: `slaap ${w.sleep}/5 · vermoeidheid ${w.fatigue}/5 · stress ${w.stress}/5`,
        })),
        ...feedPain.map((p): FeedItem => ({
          id: p.id,
          type: 'pain',
          at: p.reportedAt,
          patientId: p.userId,
          patientName: nameById.get(p.userId) ?? '—',
          detail: `${p.location} · ${p.nrs}/10`,
        })),
      ]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, FEED_TAKE)

      // Stil = actief programma maar al ≥ 7 dagen niets gelogd (sessie,
      // cardio, wellness of pijn). Patiënten zonder actief programma horen
      // hier niet — die zijn bewust niet in behandeling.
      const lastById = new Map<string, number>()
      const bump = (id: string, d: Date | null) => {
        if (!d) return
        const t = d.getTime()
        if (t > (lastById.get(id) ?? 0)) lastById.set(id, t)
      }
      for (const r of lastStrength) bump(r.patientId, r._max.completedAt)
      for (const r of lastCardio) bump(r.patientId, r._max.completedAt)
      for (const r of lastWellness) bump(r.userId, r._max.createdAt)
      for (const r of lastPain) bump(r.userId, r._max.reportedAt)

      const silentPatients = patients
        .filter(p => p.patientPrograms[0]?.status === 'ACTIVE')
        .map(p => ({
          patientId: p.id,
          name: p.name ?? p.email,
          lastActivityAt: lastById.has(p.id) ? new Date(lastById.get(p.id)!) : null,
        }))
        .filter(p => !p.lastActivityAt || p.lastActivityAt < silentSince)
        .sort((a, b) => (a.lastActivityAt?.getTime() ?? 0) - (b.lastActivityAt?.getTime() ?? 0))

      return {
        todayPlanned: todayPlannedRaw.map(s => ({
          id: s.id,
          patientId: s.patientId,
          patientName: nameById.get(s.patientId) ?? '—',
          scheduledAt: s.scheduledAt,
          completedAt: s.completedAt,
          completedAll: s.completedAll,
          programName: s.program?.name ?? null,
        })),
        recentActivity: feed,
        weekSessions: weekStrength + weekCardio,
        prevWeekSessions: prevStrength + prevCardio,
        silentPatients,
      }
    }),

  /**
   * Detail van één feed-item uit therapistDashboard.recentActivity — voor de
   * zijbalk op het dashboard. Discriminated union op `type`, zelfde shapes
   * als recentSessions/recentCardioSessions zodat de UI-weergave matcht.
   */
  activityDetail: coachStaffProcedure
    .input(z.object({
      type: z.enum(['strength', 'cardio', 'wellness', 'pain']),
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const notFound = () =>
        new TRPCError({ code: 'NOT_FOUND', message: 'Activiteit niet gevonden of geen toegang.' })

      const guard = async (patientId: string) => {
        if (!(await hasPatientAccess(ctx.prisma, ctx.user, patientId))) throw notFound()
        // Dossier-inzage door therapeut → Wabvpz-audit, net als recentSessions.
        await auditLog({
          event: 'SESSION_LOG_VIEWED',
          userId: ctx.user.id,
          actorEmail: ctx.user.email,
          resource: 'User',
          resourceId: patientId,
          metadata: { route: 'patients.activityDetail', type: input.type, id: input.id },
          req: ctx.req,
        })
      }

      if (input.type === 'strength') {
        const s = await ctx.prisma.sessionLog.findUnique({
          where: { id: input.id },
          include: {
            patient: { select: { id: true, name: true, email: true } },
            program: { select: { name: true } },
            therapist: { select: { id: true, name: true } },
            exerciseLogs: {
              select: {
                id: true,
                exerciseId: true,
                setsCompleted: true,
                repsCompleted: true,
                painLevel: true,
                weight: true,
                weightsPerSet: true,
                notes: true,
              },
            },
          },
        })
        if (!s) throw notFound()
        await guard(s.patientId)
        const exerciseIds = Array.from(new Set(s.exerciseLogs.map((el) => el.exerciseId)))
        const exercises = exerciseIds.length
          ? await ctx.prisma.exercise.findMany({
              where: { id: { in: exerciseIds } },
              select: { id: true, name: true },
            })
          : []
        const nameById = new Map(exercises.map((e) => [e.id, e.name]))
        return {
          type: 'strength' as const,
          patientId: s.patientId,
          patientName: s.patient.name ?? s.patient.email,
          completedAt: s.completedAt,
          programName: s.program?.name ?? null,
          therapistId: s.therapistId,
          therapistName: s.therapist?.name ?? null,
          durationMinutes: s.duration ? Math.round(s.duration / 60) : null,
          painLevel: s.painLevel,
          exertionLevel: s.exertionLevel,
          notes: s.notes,
          exercises: s.exerciseLogs.map((el) => ({
            id: el.id,
            name: nameById.get(el.exerciseId) ?? 'Oefening',
            sets: el.setsCompleted,
            reps: el.repsCompleted,
            weight: el.weight,
            weightsPerSet: el.weightsPerSet,
            painLevel: el.painLevel,
            notes: el.notes,
          })),
        }
      }

      if (input.type === 'cardio') {
        // Expliciete scalar-select i.p.v. include: de wearables-migratie
        // (CardioLog.source / WorkoutSource enum) is nog niet op de DB
        // toegepast, dus een impliciete "alle kolommen"-select knalt op de
        // ontbrekende `source`-kolom. We hebben `source` hier toch niet nodig.
        const c = await ctx.prisma.cardioLog.findUnique({
          where: { id: input.id },
          select: {
            patientId: true,
            completedAt: true,
            activity: true,
            protocol: true,
            durationSec: true,
            distanceM: true,
            avgPaceSecPerKm: true,
            avgHeartRate: true,
            maxHeartRate: true,
            zone: true,
            targetZone: true,
            rpe: true,
            painLevel: true,
            notes: true,
            patient: { select: { id: true, name: true, email: true } },
            program: { select: { name: true } },
          },
        })
        if (!c) throw notFound()
        await guard(c.patientId)
        return {
          type: 'cardio' as const,
          patientId: c.patientId,
          patientName: c.patient.name ?? c.patient.email,
          completedAt: c.completedAt,
          programName: c.program?.name ?? null,
          activity: c.activity,
          protocol: c.protocol,
          durationSec: c.durationSec,
          distanceM: c.distanceM,
          avgPaceSecPerKm: c.avgPaceSecPerKm,
          avgHeartRate: c.avgHeartRate,
          maxHeartRate: c.maxHeartRate,
          zone: c.zone,
          targetZone: c.targetZone,
          rpe: c.rpe,
          painLevel: c.painLevel,
          notes: c.notes,
        }
      }

      if (input.type === 'wellness') {
        const w = await ctx.prisma.wellnessCheck.findUnique({
          where: { id: input.id },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
        if (!w) throw notFound()
        await guard(w.userId)
        return {
          type: 'wellness' as const,
          patientId: w.userId,
          patientName: w.user.name ?? w.user.email,
          completedAt: w.createdAt,
          date: w.date,
          sleep: w.sleep,
          soreness: w.soreness,
          fatigue: w.fatigue,
          mood: w.mood,
          stress: w.stress,
          notes: w.notes,
        }
      }

      const p = await ctx.prisma.painEntry.findUnique({
        where: { id: input.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      if (!p) throw notFound()
      await guard(p.userId)
      return {
        type: 'pain' as const,
        patientId: p.userId,
        patientName: p.user.name ?? p.user.email,
        completedAt: p.reportedAt,
        nrs: p.nrs,
        location: p.location,
        context: p.context,
        notes: p.notes,
      }
    }),

  /**
   * Bewerk basisgegevens van een patiënt (naam, telefoon, geboortedatum) +
   * private notities van de behandelend therapeut. Toegankelijk voor de
   * gekoppelde therapeut of een collega binnen dezelfde praktijk.
   */
  update: coachStaffProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1, 'Naam is verplicht').optional(),
      phone: z.string().nullable().optional(),
      // YYYY-MM-DD of null om te wissen
      dateOfBirth: z.string().refine(
        (v) => v === '' || !Number.isNaN(Date.parse(v)),
        'Ongeldige geboortedatum',
      ).nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden of geen toegang.' })
      }

      const userData: {
        name?: string
        phone?: string | null
        dateOfBirth?: Date | null
      } = {}
      if (input.name !== undefined) userData.name = input.name.trim()
      if (input.phone !== undefined) userData.phone = input.phone?.trim() || null
      if (input.dateOfBirth !== undefined) {
        userData.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
      }

      if (Object.keys(userData).length > 0) {
        // updateMany (niet update) zodat we een target-rol-filter kunnen zetten:
        // dit endpoint mag alleen patiënt/atleet-profielen bewerken, nooit dat
        // van een collega-THERAPIST/ADMIN in dezelfde praktijk.
        await ctx.prisma.user.updateMany({
          where: { id: input.id, role: { in: ['PATIENT', 'ATHLETE'] } },
          data: userData,
        })
      }

      if (input.notes !== undefined) {
        // Notities zijn private per therapeut → alleen eigen relatie updaten.
        await ctx.prisma.patientTherapist.updateMany({
          where: { therapistId: ctx.user.id, patientId: input.id, isActive: true },
          data: { notes: input.notes },
        })
      }

      return { ok: true }
    }),

  /**
   * Co-monitoring: een therapeut laten meekijken bij een atleet.
   *
   * De coach begeleidt de training, de fysiotherapeut kijkt mee op het
   * klinische deel. De koppeling wordt als PENDING aangemaakt; de atleet
   * keurt hem goed via de bestaande consent-flow in zijn instellingen. Zo
   * beslist de atleet zelf wie zijn dossier ziet, en niet de coach.
   *
   * v1 werkt alleen met een therapeut die al een account heeft. Iemand van
   * buiten uitnodigen zou betekenen dat we een therapeut-account aanmaken op
   * gezag van een coach, en dat hoort bij de beheerder.
   */
  inviteCoMonitor: mfaCoachStaffProcedure
    .input(z.object({ patientId: z.string(), email: z.string().email('Ongeldig e-mailadres') }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Atleet niet gevonden of geen toegang.' })
      }
      const email = input.email.toLowerCase().trim()
      const therapist = await ctx.prisma.user.findUnique({
        where: { email },
        // practiceId hoort erbij: de markering die hieronder opgeheven wordt is
        // van de PRAKTIJK van de meekijker, niet van de uitnodigende coach.
        select: { id: true, name: true, email: true, role: true, practiceId: true },
      })
      if (!therapist || therapist.role !== 'THERAPIST') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Geen therapeut gevonden met dit e-mailadres. Vraag de beheerder om een account.',
        })
      }
      if (therapist.id === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Je kunt jezelf niet uitnodigen.' })
      }

      const existing = await ctx.prisma.patientTherapist.findUnique({
        where: { therapistId_patientId: { therapistId: therapist.id, patientId: input.patientId } },
        select: { id: true, status: true, isActive: true },
      })
      if (existing && existing.isActive && existing.status !== 'DECLINED') {
        return { ok: true, alreadyLinked: true, status: existing.status }
      }

      // Koppeling terug tot leven én de markering opheffen in één transactie.
      // Los van elkaar levert een gefaalde tweede stap precies de onzichtbare
      // toestand op die dit moet wegnemen.
      //
      // De scope is die van de UITGENODIGDE therapeut: heeft zijn praktijk deze
      // atleet afgesloten en zet de coach hem daarna als meekijker terug, dan
      // hoort die markering weg. `doorId` blijft de coach, want die drukt op de
      // knop.
      const relation = await ctx.prisma.$transaction(async (tx) => {
        const rij = existing
          ? await tx.patientTherapist.update({
              where: { id: existing.id },
              data: { status: 'PENDING', isActive: true, requestedAt: new Date(), respondedAt: null },
            })
          : await tx.patientTherapist.create({
              data: {
                therapistId: therapist.id,
                patientId: input.patientId,
                status: 'PENDING',
                isActive: true,
                requestedAt: new Date(),
              },
            })
        await hefUitbehandeldOp(tx, therapist, input.patientId, ctx.user.id)
        return rij
      })

      await auditLog({
        event: 'CO_MONITOR_REQUESTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientTherapist',
        resourceId: relation.id,
        metadata: { therapistId: therapist.id, patientId: input.patientId, via: 'coach-co-monitor' },
        req: ctx.req,
      })

      return { ok: true, alreadyLinked: false, status: 'PENDING' as const, therapistName: therapist.name }
    }),

  changeRole: mfaTherapistProcedure
    .input(z.object({
      id: z.string(),
      // Therapeuten mogen alleen tussen PATIENT en ATHLETE wisselen — NIET promoveren
      // naar THERAPIST of ADMIN. Zie security review #1.
      role: z.enum(['PATIENT', 'ATHLETE']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Patient van eigen koppeling OF zelfde praktijk.
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Patiënt niet gevonden' })
      }

      // Extra defense: zorg dat de target-user geen THERAPIST/ADMIN is die we hiermee
      // zouden degraderen naar PATIENT/ATHLETE.
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { role: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })
      if (target.role !== 'PATIENT' && target.role !== 'ATHLETE') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Kan rol van deze gebruiker niet wijzigen' })
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.id },
        data: { role: input.role },
        select: { id: true, role: true, supabaseUserId: true, email: true },
      })

      // Anders blijft de oude rol tot 60s (USER_CACHE_TTL) in de context-cache staan.
      if (updated.supabaseUserId) invalidateUserCache(updated.supabaseUserId)

      // Sync ook Supabase user_metadata.role — anders blijft de proxy/middleware
      // en LoginForm de oude rol gebruiken (die lezen user_metadata, niet de DB).
      try {
        const supabaseAdmin = createSupabaseAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        let supaUserId = updated.supabaseUserId
        if (!supaUserId) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
          supaUserId = users.find(u => u.email?.toLowerCase() === updated.email.toLowerCase())?.id ?? null
        }
        if (supaUserId) {
          await supabaseAdmin.auth.admin.updateUserById(supaUserId, {
            user_metadata: { role: updated.role },
          })
        }
      } catch (e) {
        console.error('changeRole: failed to sync Supabase user_metadata', e)
      }

      return updated
    }),

  /**
   * Invite a new patient/athlete/therapist. Works for both web (cookie auth) and
   * mobile (Bearer token) — no internal fetch needed.
   *
   * MFA vereist: spiegelt `invite.create`. Deze flow kan (bij resend) de
   * Supabase-auth-user van een bestaande patiënt verwijderen — een gevoelige
   * actie die niet onder de MFA-drempel uit mag.
   */
  invite: mfaCoachStaffProcedure
    .input(
      z.object({
        email: z.string().email('Ongeldig e-mailadres'),
        name: z.string().min(1, 'Naam is verplicht'),
        // Therapeuten mogen ALLEEN patiënten/atleten uitnodigen. Nieuwe therapeuten
        // aanmaken is admin-only; nooit via deze procedure (security review #2).
        role: z.enum(['PATIENT', 'ATHLETE']).default('PATIENT'),
        resend: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { email, name, role, resend } = input

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // Als er al een User-record bestaat met dit e-mailadres: verifieer dat
      // (a) het een PATIENT/ATHLETE is en (b) de caller een actieve relatie heeft
      // (of ADMIN is). Anders kan een kwaadwillende therapeut via `resend: true`
      // Supabase auth-users van willekeurige e-mailadressen laten verwijderen.
      const existingDbUser = await ctx.prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      })
      if (existingDbUser) {
        if (existingDbUser.role !== 'PATIENT' && existingDbUser.role !== 'ATHLETE') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Dit e-mailadres hoort bij een bestaand therapeut- of admin-account.',
          })
        }
        if (!(await hasPatientAccess(ctx.prisma, ctx.user, existingDbUser.id))) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Deze gebruiker is al bekend en niet aan jou of jouw praktijk gekoppeld.',
          })
        }
      }

      // If resend: delete the existing Supabase auth user first so we can re-invite
      if (resend) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = users.find(u => u.email === email)
        if (existingUser) {
          // Alleen verwijderen als we hierboven hebben geverifieerd dat het een
          // eigen patiënt/atleet is (of de caller admin is).
          if (!existingDbUser && ctx.user.role !== 'ADMIN') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Kan deze uitnodiging niet opnieuw versturen.',
            })
          }
          await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
        }
      }

      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : 'http://localhost:3000')

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role, name },
        redirectTo: `${redirectBase}/auth/callback`,
      })

      if (error) {
        if (!resend && (error.message.includes('already') || error.message.includes('exists'))) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Deze gebruiker bestaat al.',
          })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message || 'Uitnodiging mislukt',
        })
      }

      // Create/update the user record. Nieuwe user krijgt dezelfde practiceId
      // als de uitnodigende therapeut, zodat multi-tenant scope klopt.
      const patient = await ctx.prisma.user.upsert({
        where: { email },
        update: { name },
        create: {
          id: data.user.id,
          email,
          name,
          role,
          practiceId: ctx.user.practiceId ?? null,
        },
      })

      // De `on_auth_user_created`-trigger kan hierboven al een stub-rij hebben
      // gemaakt. Die kent de bedoelde rol niet meer (sinds de fix van
      // 2026-07-27 leest hij de rol niet meer uit client-metadata) en valt
      // terug op PATIENT. De server is autoritatief: corrigeer de rol zolang
      // de rij nog niet aan een Supabase-account gebonden is. Een bestaande,
      // gebonden gebruiker raken we bewust niet aan — dat was en blijft de
      // bescherming tegen rol-overschrijving via een openstaande invite.
      if (!patient.supabaseUserId && (patient.role !== role || !patient.practiceId)) {
        await ctx.prisma.user.update({
          where: { id: patient.id },
          data: { role, practiceId: ctx.user.practiceId ?? null },
        })
      }

      // Link therapist ↔ patient (only for PATIENT/ATHLETE). Status = PENDING
      // zodat de patiënt zelf moet bevestigen voordat de therapeut data inziet.
      if (role === 'PATIENT' || role === 'ATHLETE') {
        // Koppeling activeren en de markering opheffen horen bij elkaar: samen
        // in één transactie, anders zet een gefaalde tweede stap de koppeling
        // terug op actief terwijl de patiënt in geen enkele lijst verschijnt,
        // zonder foutmelding.
        await ctx.prisma.$transaction(async (tx) => {
          await tx.patientTherapist.upsert({
            where: {
              therapistId_patientId: {
                therapistId: ctx.user.id,
                patientId: patient.id,
              },
            },
            update: { isActive: true },
            create: {
              therapistId: ctx.user.id,
              patientId: patient.id,
              status: 'PENDING',
              requestedAt: new Date(),
            },
          })
          await hefUitbehandeldOp(tx, ctx.user, patient.id)
        })
      }

      return { success: true, resent: !!resend, patientId: patient.id }
    }),

  // MFA vereist: verwijdert de bestaande Supabase-auth-user vóór her-invite.
  resendInvite: mfaCoachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze patiënt' })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { email: true, name: true, role: true },
      })
      if (!patient) throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden' })

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = users.find(u => u.email === patient.email)
      if (existingUser) {
        await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
      }

      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : 'http://localhost:3000')

      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(patient.email, {
        data: { role: patient.role, name: patient.name },
        redirectTo: `${redirectBase}/auth/callback`,
      })
      if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })

      // Opnieuw uitnodigen betekent weer in behandeling. Pas ná de geslaagde
      // uitnodiging: een mislukte mail hoort de markering niet op te heffen.
      // Geen transactie nodig, dit pad raakt de koppeling niet aan en de helper
      // is zelf al één atomaire eenheid.
      await hefUitbehandeldOp(ctx.prisma, ctx.user, input.id)

      return { success: true }
    }),

  /**
   * Eigen koppeling verbreken. Ook voor een coach: hij kan atleten uitnodigen,
   * dus hij moet ze ook kunnen loslaten. De query hieronder is al gebonden aan
   * `therapistId: ctx.user.id`, dus je raakt nooit de koppeling van een ander.
   */
  delete: mfaCoachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Alleen actieve relaties (APPROVED of PENDING) mogen via deze knop
      // gedelete worden. Een ex-therapeut wiens toegang door de patient is
      // ingetrokken (REVOKED/DECLINED) mag de programma's van die patient
      // niet meer cascade-deleten.
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user.id,
          patientId: input.id,
          isActive: true,
          status: { in: ['APPROVED', 'PENDING'] },
        },
      })
      if (!relation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden' })
      }

      await ctx.prisma.patientTherapist.deleteMany({
        where: { therapistId: ctx.user.id, patientId: input.id },
      })

      await ctx.prisma.program.deleteMany({
        where: { patientId: input.id, creatorId: ctx.user.id },
      })

      return { success: true }
    }),

  /**
   * Zet een patiënt op inactief (uitbehandeld).
   *
   * Dit is géén verwijdering en géén toegangsintrekking: de patiënt houdt zijn
   * account, zijn app en zijn dossier. Hij verdwijnt alleen uit de werklijsten,
   * de signalen en de herinneringen van deze praktijk of deze coach. De
   * markering is daarom scope-gebonden (zie care-scope.ts): dezelfde persoon
   * kan bij een coach uitbehandeld zijn en bij een praktijk nog lopen.
   */
  setInactive: coachStaffProcedure
    .input(z.object({
      id: z.string(),
      reason: z.enum(['COMPLETED', 'DISCONTINUED', 'TRANSFERRED', 'NO_SHOW', 'OTHER']),
      note: z.string().max(2000).optional(),
      /** Programma's die mee afgesloten worden. Leeg = geen enkel programma. */
      closeProgramIds: z.array(z.string()).default([]),
      /** Sluit het lopende rehab-traject mee af, met uitkomst UNKNOWN. */
      closeTraject: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // hasPatientAccess filtert NIET op de rol van het doel en geeft true voor
      // jezelf. Zonder deze check kan een therapeut een collega, een admin of
      // zichzelf archiveren, en dat faalt stil omdat de lijsten op rol filteren.
      // Zelfde vorm als patients.update hierboven.
      const doel = await ctx.prisma.user.findFirst({
        where: { id: input.id, role: { in: ['PATIENT', 'ATHLETE'] } },
        select: { id: true },
      })
      if (!doel) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen patiënten en atleten' })
      }

      // Een traject afsluiten is een klinisch besluit. Elke procedure in
      // rehab.ts staat daarom op therapistProcedure, en AGENTS.md legt vast dat
      // klinische schrijfacties daar horen. Een coach mag hier wel archiveren
      // (dat is planning, geen behandeling), maar niet de episode van een
      // meekijkende therapeut dichtzetten: die kan hij daarna zelf niet meer
      // heropenen, want rehab.reopenTraject is ook therapistProcedure.
      const magTrajectSluiten = ctx.user.role === 'THERAPIST' || ctx.user.role === 'ADMIN'
      if (input.closeTraject && !magTrajectSluiten) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: TRAJECT_ALLEEN_THERAPEUT })
      }

      const scope = careScopeKey(ctx.user)
      const nu = new Date()

      const geslotenTrajectId = await ctx.prisma.$transaction(async (tx) => {
        await tx.patientCareStatus
          .create({
            data: {
              patientId: input.id,
              practiceId: scope.practiceId,
              coachId: scope.coachId,
              dischargedAt: nu,
              dischargedById: ctx.user.id,
              reason: input.reason,
              // Vrije toelichting hoort hier, op de rij achter RLS, en niet in
              // de audit-metadata (audit.ts:7-8 verbiedt PII daar).
              note: input.note ?? null,
            },
          })
          .catch(alsConflict(AL_INACTIEF))
        if (input.closeProgramIds.length > 0) {
          // `patientId` houdt de ids gebonden aan deze patiënt, `programmaScope`
          // aan de eigen praktijk of coach, en `closedByDischarge` markeert wat
          // bij heractiveren terug mag.
          await tx.program.updateMany({
            where: {
              id: { in: input.closeProgramIds },
              patientId: input.id,
              status: 'ACTIVE',
              ...programmaScope(scope, ctx.user.id),
            },
            data: { status: 'COMPLETED', endDate: nu, closedByDischarge: true },
          })
        }
        // Open insights worden hier bewust NIET gedempt. Insight heeft geen
        // praktijk- of coach-kolom, dus een updateMany raakt álle open signalen
        // van deze patiënt, ook die van een andere behandelaar, en heractiveren
        // zet ze niet terug. Delen een coach en een praktijk-therapeut een
        // atleet, dan verdwijnt bij de een een kritieke pijnmelding omdat de
        // ander archiveert. Het leesfilter in insights.getDashboard (taak 15)
        // kijkt scope-bewust naar de care-status; daarmee is dempen voor de
        // archiverende partij overbodig en voor de meekijker destructief.
        return input.closeTraject ? closeOpenTrajectFor(tx, input.id, ctx.user.id) : null
      })

      if (geslotenTrajectId) {
        // Aparte regel naast PATIENT_DISCHARGED, met `route` op setInactive:
        // zo is in het log te zien dat dit een neveneffect was en niet een
        // therapeut die zelf een uitkomst koos.
        await auditLog({
          event: 'REHAB_TRAJECT_CLOSED',
          userId: ctx.user.id,
          actorEmail: ctx.user.email,
          resource: 'PatientRehabTracker',
          resourceId: geslotenTrajectId,
          metadata: { route: 'patients.setInactive', outcome: 'UNKNOWN' },
          req: ctx.req,
        })
      }

      await auditLog({
        event: 'PATIENT_DISCHARGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.id,
        metadata: { route: 'patients.setInactive', reason: input.reason },
        req: ctx.req,
      })
      return { success: true }
    }),

  /**
   * Haal een patiënt terug in de actieve lijst.
   *
   * Alleen binnen de eigen scope: een praktijk haalt geen coach-markering weg
   * en andersom. Programma's die bij het archiveren zijn dichtgezet komen mee
   * terug, met hun startdatum opgeschoven over de onderbreking heen.
   *
   * De uitbehandel-rij wordt afgestempeld en niet verwijderd, zodat de reden en
   * de toelichting van die periode terug te lezen blijven. Een patiënt kan dus
   * meerdere afgesloten periodes hebben; alleen de rij met `reactivatedAt` null
   * telt als "nu inactief", en dat filter zit in careScopeWhere zelf.
   */
  reactivate: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // Zelfde rolfilter als setInactive. Vandaag onbereikbaar (zonder
      // markering is er niets te heractiveren, en markeren kan alleen op een
      // patiënt of atleet), maar de verdediging hoort op allebei de paden te
      // staan en niet op één.
      const doel = await ctx.prisma.user.findFirst({
        where: { id: input.id, role: { in: ['PATIENT', 'ATHLETE'] } },
        select: { id: true },
      })
      if (!doel) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen patiënten en atleten' })
      }

      const scope = careScopeKey(ctx.user)
      // careScopeWhere filtert zelf op `reactivatedAt: null`, dus dit vindt
      // alleen een lopende markering. Twee keer heractiveren geeft daardoor
      // vanzelf NOT_FOUND in plaats van een tweede startdatum-schuif.
      const rij = await ctx.prisma.patientCareStatus.findFirst({
        where: { patientId: input.id, ...careScopeWhere(ctx.user) },
      })
      if (!rij) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deze patiënt is niet inactief' })
      }

      const onderbreking = Date.now() - rij.dischargedAt.getTime()

      await ctx.prisma.$transaction(async (tx) => {
        // Afstempelen, niet verwijderen. De reden en de toelichting van deze
        // afsluiting zijn een klinisch oordeel dat vanwege de PII-regel niet in
        // de audit-log staat; met een DELETE was het na één misklik weg.
        await tx.patientCareStatus.update({
          where: { id: rij.id },
          data: { reactivatedAt: new Date(), reactivatedById: ctx.user.id },
        })
        // Alleen programma's die door het archiveren dichtgingen, en alleen
        // binnen de eigen scope. Wat de therapeut zelf afrondde blijft
        // COMPLETED, en wat een coach dichtzette blijft van de coach.
        //
        // Geankerd op DEZE afgesloten periode, niet op de vlag alleen.
        // `setInactive` schrijft `endDate` en `dischargedAt` met dezelfde
        // instant, dus alles wat bij deze periode hoort heeft een endDate op of
        // ná de ontslagdatum. Zonder dat anker herrijst een programma uit een
        // vórige periode: die vlag blijft staan zodra een re-invite de markering
        // opheft (dat pad zet geen enkel programma terug), en dan komt een
        // programma van maanden geleden mee op ACTIVE met een startdatum die
        // over de verkeerde onderbreking is opgeschoven. `status: 'COMPLETED'`
        // hoort er om dezelfde reden bij: wie handmatig is heropend mag geen
        // tweede schuif krijgen.
        const gesloten = await tx.program.findMany({
          where: {
            patientId: input.id,
            closedByDischarge: true,
            status: 'COMPLETED',
            endDate: { gte: rij.dischargedAt },
            ...programmaScope(scope, ctx.user.id),
          },
          select: { id: true, startDate: true },
        })
        for (const p of gesloten) {
          await tx.program.update({
            where: { id: p.id },
            data: {
              status: 'ACTIVE',
              endDate: null,
              closedByDischarge: false,
              // Schuif startDate op met de duur van de onderbreking. Zonder dat
              // springt computeCurrentWeekDay (patient.ts) meteen naar de
              // laatste week: die rekent kaal in dagen sinds startDate.
              startDate: p.startDate ? new Date(p.startDate.getTime() + onderbreking) : null,
            },
          })
        }
        // Vlaggen uit een oudere periode opruimen. Binnen deze scope kan er maar
        // één markering tegelijk openstaan, dus alles wat vóór deze afsluiting
        // dichtging hoort bij een periode die allang voorbij is. Zulke rijen
        // bestaan in productie doordat de invite-paden de markering opheffen
        // zonder programma's terug te zetten; zonder deze opruiming blijven ze
        // voor altijd op "wacht op heractivering" staan.
        //
        // `endDate: null` hoort er expliciet bij, want Prisma's `lt` matcht geen
        // NULL en "Heropenen" zet endDate juist op null. Dat was het gat: een
        // heropend programma ontsnapte hier én aan de findMany hierboven (die
        // eist COMPLETED), hield zijn vlag voor altijd, en herrees twee cycli
        // later als de therapeut het zelf had afgerond. `programs.save` zet de
        // vlag inmiddels al bij het heropenen uit; dit is het vangnet voor de
        // rijen die daar in productie al doorheen zijn.
        //
        // De voorwaarde staat in AND en niet los als `OR`, omdat programmaScope
        // voor een therapeut zelf een `OR` teruggeeft. Twee OR-sleutels in
        // hetzelfde object overschrijven elkaar stil.
        await tx.program.updateMany({
          where: {
            patientId: input.id,
            closedByDischarge: true,
            ...programmaScope(scope, ctx.user.id),
            AND: [{ OR: [{ endDate: { lt: rij.dischargedAt } }, { endDate: null }] }],
          },
          data: { closedByDischarge: false },
        })
      })

      await auditLog({
        event: 'PATIENT_REACTIVATED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.id,
        metadata: { route: 'patients.reactivate' },
        req: ctx.req,
      })
      return { success: true }
    }),

  // ── Live behandeling loggen (therapist doet dit ter plekke met patient) ──

  /**
   * Therapeut logt een behandelsessie voor een patient. Gebaseerd op
   * patient.logSession, maar neemt patientId als input en verifieert de
   * therapist-patient-relatie.
   */
  logSessionForPatient: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        programId: z.string().optional(),
        scheduledAt: z.string(),
        completedAt: z.string(),
        durationSeconds: z.number().int().min(0),
        painLevel: z.number().int().min(0).max(10).nullable(),
        exertionLevel: z.number().int().min(0).max(10).nullable(),
        feelScore: z.number().int().min(1).max(5).nullable().optional(),
        notes: z.string().optional(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).optional(),
            repsCompleted: z.number().int().min(0).optional(),
            repUnit: z.string().optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().nullable().optional(),
            weightsPerSet: z.array(z.number().nullable()).nullable().optional(),
            repsPerSet: z.array(z.number().nullable()).nullable().optional(),
            extraParams: z.array(z.object({
              id: z.string(),
              label: z.string(),
              type: z.enum(['number', 'text', 'select', 'slider']),
              value: z.union([z.string(), z.number()]),
              unit: z.string().optional(),
              options: z.array(z.string()).optional(),
              min: z.number().optional(),
              max: z.number().optional(),
            })).nullable().optional(),
            supersetGroup: z.string().nullable().optional(),
            phase: z.enum(['WARMUP', 'MAIN']).nullable().optional(),
            estimatedOneRepMax: z.number().nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patient is niet aan jou of jouw praktijk gekoppeld',
        })
      }

      // Idempotentie tegen dubbel-loggen (zelfde patroon als patient.logSession):
      // een dubbel-tik op "afronden" of een retry dragen een identieke
      // scheduledAt (ms-precies startmoment). Bestaat er al zo'n verse sessie
      // van deze patiënt, geef die terug i.p.v. een duplicaat aan te maken.
      const scheduled = new Date(input.scheduledAt)
      const existingDup = await ctx.prisma.sessionLog.findFirst({
        where: {
          patientId: input.patientId,
          scheduledAt: scheduled,
          status: 'COMPLETED',
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
        select: { id: true },
      })
      if (existingDup) return existingDup

      const created = await ctx.prisma.sessionLog.create({
        data: {
          id: createId(),
          patientId: input.patientId,
          // Behandelend therapeut wordt vastgelegd zodat collega's in de
          // historie zien wie deze sessie heeft uitgevoerd.
          therapistId: ctx.user.id,
          programId: input.programId ?? undefined,
          scheduledAt: new Date(input.scheduledAt),
          completedAt: new Date(input.completedAt),
          status: 'COMPLETED',
          // Doorgelopen-timer afvangen: kap absurde duren af zodat ze de
          // belasting-curve (ACWR/vorm) niet vergiftigen. Sessie blijft behouden.
          duration: clampSessionDurationSec(input.durationSeconds),
          painLevel: input.painLevel,
          exertionLevel: input.exertionLevel,
          feelScore: input.feelScore ?? null,
          notes: input.notes ?? undefined,
          exerciseLogs: {
            create: input.exercises.map((ex) => {
              // Zelfde afleiding als patient.logSession: zwaarste set als
              // legacy weight-paar wanneer alleen per-set arrays meekomen.
              const top = deriveTopSet(ex.weightsPerSet, ex.repsPerSet)
              const weight = ex.weight ?? top.weight
              return {
                id: createId(),
                exerciseId: ex.exerciseId,
                setsCompleted: ex.setsCompleted ?? null,
                repsCompleted: ex.repsCompleted ?? null,
                repUnit: ex.repUnit ?? null,
                painLevel: ex.painLevel ?? null,
                weight,
                weightsPerSet: ex.weightsPerSet ?? undefined,
                repsPerSet: ex.repsPerSet ?? undefined,
                extraParams: ex.extraParams ?? undefined,
                supersetGroup: ex.supersetGroup ?? null,
                phase: ex.phase ?? null,
                // Epley-fallback server-side — zie src/lib/one-rep-max.ts
                estimatedOneRepMax: ex.estimatedOneRepMax
                  ?? estimateOneRepMax(weight, top.reps ?? ex.repsCompleted),
                painDuring: ex.painDuring ?? null,
              }
            }),
          },
        },
        select: { id: true },
      })
      // Therapeut kan bij het afronden #tags op de klacht zetten. taggedById =
      // de therapeut zodat de tijdlijn "wie" laat zien; patientId blijft de
      // patiënt zodat de tag onder diens dossier valt.
      await syncHashtagsForLog(ctx.prisma, {
        patientId: input.patientId,
        taggedById: ctx.user.id,
        loggedAt: new Date(input.completedAt),
        notes: input.notes,
        target: { sessionLogId: created.id },
      })
      return created
    }),

  /**
   * Bewerk een eerder gelogde sessie (na "BEHANDELING AFRONDEN"). Vervangt
   * de exerciseLogs volledig — eenvoudiger dan diff-en, en past bij de
   * intentie ("alles is editable na opslaan").
   */
  updateSessionLog: therapistProcedure
    .input(
      z.object({
        sessionId: z.string(),
        scheduledAt: z.string().optional(),
        completedAt: z.string().optional(),
        durationSeconds: z.number().int().min(0).optional(),
        painLevel: z.number().int().min(0).max(10).nullable().optional(),
        exertionLevel: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().nullable().optional(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).nullable().optional(),
            repsCompleted: z.number().int().min(0).nullable().optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().nullable().optional(),
            weightsPerSet: z.array(z.number().nullable()).nullable().optional(),
            extraParams: z.array(z.object({
              id: z.string(),
              label: z.string(),
              type: z.enum(['number', 'text', 'select', 'slider']),
              value: z.union([z.string(), z.number()]),
              unit: z.string().optional(),
              options: z.array(z.string()).optional(),
              min: z.number().optional(),
              max: z.number().optional(),
            })).nullable().optional(),
            supersetGroup: z.string().nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          }),
        ).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        select: { patientId: true, completedAt: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden' })
      }
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, session.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const updates: Record<string, unknown> = {}
      if (input.scheduledAt) updates.scheduledAt = new Date(input.scheduledAt)
      if (input.completedAt) updates.completedAt = new Date(input.completedAt)
      if (input.durationSeconds !== undefined) updates.duration = clampSessionDurationSec(input.durationSeconds)
      if (input.painLevel !== undefined) updates.painLevel = input.painLevel
      if (input.exertionLevel !== undefined) updates.exertionLevel = input.exertionLevel
      if (input.notes !== undefined) updates.notes = input.notes ?? null

      await ctx.prisma.$transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx.sessionLog.update({
            where: { id: input.sessionId },
            data: updates,
          })
        }
        if (input.exercises) {
          await tx.exerciseLog.deleteMany({ where: { sessionId: input.sessionId } })
          if (input.exercises.length > 0) {
            await tx.exerciseLog.createMany({
              data: input.exercises.map((ex) => ({
                id: createId(),
                sessionId: input.sessionId,
                exerciseId: ex.exerciseId,
                setsCompleted: ex.setsCompleted ?? null,
                repsCompleted: ex.repsCompleted ?? null,
                painLevel: ex.painLevel ?? null,
                weight: ex.weight ?? null,
                weightsPerSet: (ex.weightsPerSet ?? undefined) as never,
                extraParams: (ex.extraParams ?? undefined) as never,
                supersetGroup: ex.supersetGroup ?? null,
                painDuring: ex.painDuring ?? null,
              })),
            })
          }
        }
      })

      // Notitie-edit kan hashtags toevoegen/verwijderen → hersync (idempotent).
      if (input.notes !== undefined) {
        await syncHashtagsForLog(ctx.prisma, {
          patientId: session.patientId,
          taggedById: ctx.user.id,
          loggedAt: input.completedAt ? new Date(input.completedAt) : session.completedAt ?? new Date(),
          notes: input.notes,
          target: { sessionLogId: input.sessionId },
        })
      }

      return { id: input.sessionId }
    }),

  /**
   * Volledige sessie ophalen voor bewerking — inclusief alle exerciseLogs
   * met nieuwe velden (weightsPerSet, extraParams, supersetGroup).
   */
  getSessionLog: therapistProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        include: {
          program: { select: { id: true, name: true } },
          therapist: { select: { id: true, name: true } },
          exerciseLogs: true,
        },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden' })
      }
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, session.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const exerciseIds = session.exerciseLogs.map((el) => el.exerciseId)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []
      const nameById = new Map(exercises.map((e) => [e.id, e]))
      return {
        id: session.id,
        patientId: session.patientId,
        programName: session.program?.name ?? null,
        therapistId: session.therapistId,
        therapistName: session.therapist?.name ?? null,
        scheduledAt: session.scheduledAt,
        completedAt: session.completedAt,
        durationSeconds: session.duration,
        painLevel: session.painLevel,
        exertionLevel: session.exertionLevel,
        notes: session.notes,
        exercises: session.exerciseLogs.map((el) => ({
          id: el.id,
          exerciseId: el.exerciseId,
          name: nameById.get(el.exerciseId)?.name ?? 'Oefening',
          category: nameById.get(el.exerciseId)?.category ?? 'STRENGTH',
          setsCompleted: el.setsCompleted,
          repsCompleted: el.repsCompleted,
          weight: el.weight,
          weightsPerSet: Array.isArray(el.weightsPerSet)
            ? (el.weightsPerSet as Array<number | null>)
            : null,
          extraParams: Array.isArray(el.extraParams)
            ? (el.extraParams as Array<Record<string, unknown>>)
            : [],
          supersetGroup: el.supersetGroup,
          painLevel: el.painLevel,
          painDuring: el.painDuring,
          notes: el.notes,
        })),
      }
    }),

  /**
   * Uitgebreide patient-dashboard data voor therapist: sessie-historie,
   * load-metrics bron, frequentie en meest-gedane oefeningen.
   */
  getDashboardData: coachStaffProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.getDashboardData' },
        req: ctx.req,
      })

      const since = new Date()
      since.setDate(since.getDate() - 60) // 60d historie

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: input.patientId,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
        orderBy: { completedAt: 'desc' },
        include: {
          program: { select: { id: true, name: true } },
          therapist: { select: { id: true, name: true } },
          exerciseLogs: {
            select: { exerciseId: true },
          },
        },
      })

      // Exercise-namen voor top-5
      const exIdCounts = new Map<string, number>()
      for (const s of sessions) {
        for (const el of s.exerciseLogs) {
          exIdCounts.set(el.exerciseId, (exIdCounts.get(el.exerciseId) ?? 0) + 1)
        }
      }
      const topExerciseIds = Array.from(exIdCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id)

      const topExercises = topExerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: topExerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []

      const topExercisesWithCount = topExerciseIds.map((id) => {
        const ex = topExercises.find((e) => e.id === id)
        return {
          id,
          name: ex?.name ?? 'Oefening',
          category: ex?.category ?? 'STRENGTH',
          count: exIdCounts.get(id) ?? 0,
        }
      })

      // Recent wellness checks
      const wellnessChecks = await ctx.prisma.wellnessCheck.findMany({
        where: { userId: input.patientId, date: { gte: since } },
        orderBy: { date: 'desc' },
        take: 14,
      })

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          completedAt: s.completedAt,
          programName: s.program?.name ?? null,
          therapistId: s.therapistId,
          therapistName: s.therapist?.name ?? null,
          durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
          exerciseCount: s.exerciseLogs.length,
          painLevel: s.painLevel,
          exertionLevel: s.exertionLevel,
          notes: s.notes,
        })),
        topExercises: topExercisesWithCount,
        wellnessChecks,
      }
    }),

  // ── Losse pijn-meldingen (patiënt-gerapporteerd, los van een sessie) ─────
  // De patiënt kan via "Pijn rapporteren" een NRS-melding insturen. Die werd
  // wél opgeslagen (PainEntry) maar nergens aan de therapeut getoond — dit is
  // het lees-pad zodat de melding daadwerkelijk bij de behandelaar landt.
  /**
   * Maandoverzicht van één persoon: totalen, de verdeling per dag, en hoeveel
   * van het geplande werk daadwerkelijk is gedaan.
   *
   * Drie bronnen die niet dubbel mogen tellen: in-app gelogde (kracht)sessies
   * uit SessionLog, cardio uit CardioLog (inclusief wat van de watch of Strava
   * binnenkomt), en het geplande werk uit de weekplanner. Een cardio-sessie die
   * via de planner is gestart staat in CardioLog, niet in SessionLog, dus de
   * twee overlappen niet.
   *
   * `month` is YYYY-MM en wordt in NL-tijd uitgerekend (zie AGENTS.md: nooit
   * in UTC, anders schuift de eerste of laatste dag een maand op).
   */
  monthlySummary: coachStaffProcedure
    .input(z.object({
      patientId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/, 'Ongeldige maand'),
    }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Niet gevonden of geen toegang.' })
      }
      const [y, m] = input.month.split('-').map(Number)
      const from = amsMidnight(`${input.month}-01`)
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      const to = amsMidnight(nextMonth)

      const [sessions, cardio, plannedItems] = await Promise.all([
        ctx.prisma.sessionLog.findMany({
          where: {
            patientId: input.patientId,
            status: 'COMPLETED',
            completedAt: { gte: from, lt: to },
          },
          select: { completedAt: true, duration: true },
        }),
        ctx.prisma.cardioLog.findMany({
          where: { patientId: input.patientId, completedAt: { gte: from, lt: to } },
          select: {
            completedAt: true,
            activity: true,
            durationSec: true,
            distanceM: true,
            calories: true,
          },
        }),
        ctx.prisma.weekScheduleDayItem.findMany({
          where: {
            kind: { in: ['PROGRAM', 'WORKOUT'] },
            day: { weekSchedule: { patientId: input.patientId, isTemplate: false } },
          },
          select: { id: true, day: { select: { dayOfWeek: true, weekSchedule: { select: { startDate: true } } } } },
        }),
      ])

      // Per dag optellen. `bucket` groepeert de activiteit tot wat je in een
      // maandoverzicht wilt onderscheiden; de rest valt onder "overig".
      type Bucket = 'strength' | 'run' | 'bike' | 'other'
      const bucketOf = (activity: string): Bucket =>
        activity === 'RUNNING' ? 'run'
          : activity === 'CYCLING' || activity === 'WATTBIKE' || activity === 'ASSAULT_BIKE' ? 'bike'
            : 'other'

      const days = new Map<string, Record<Bucket, { min: number; m: number; kcal: number; n: number }>>()
      const empty = (): Record<Bucket, { min: number; m: number; kcal: number; n: number }> => ({
        strength: { min: 0, m: 0, kcal: 0, n: 0 },
        run: { min: 0, m: 0, kcal: 0, n: 0 },
        bike: { min: 0, m: 0, kcal: 0, n: 0 },
        other: { min: 0, m: 0, kcal: 0, n: 0 },
      })
      const add = (date: Date, b: Bucket, min: number, meters: number, kcal: number) => {
        const key = dateKey(date)
        const row = days.get(key) ?? empty()
        row[b].min += min
        row[b].m += meters
        row[b].kcal += kcal
        row[b].n += 1
        days.set(key, row)
      }

      for (const s of sessions) {
        if (!s.completedAt) continue
        // duration is seconden; null = niet geklokt, telt wel als sessie mee.
        add(s.completedAt, 'strength', Math.round((s.duration ?? 0) / 60), 0, 0)
      }
      for (const c of cardio) {
        add(
          c.completedAt,
          bucketOf(c.activity),
          Math.round(c.durationSec / 60),
          c.distanceM ?? 0,
          c.calories ?? 0,
        )
      }

      // Gepland in deze maand: de weekplanner ankert op de maandag van de week,
      // dus de datum van een item is die maandag plus zijn dagnummer.
      let planned = 0
      for (const it of plannedItems) {
        const start = it.day.weekSchedule.startDate
        if (!start) continue
        const d = new Date(start)
        d.setDate(d.getDate() + it.day.dayOfWeek)
        if (d >= from && d < to) planned += 1
      }

      const totalSessions = sessions.length + cardio.length
      const totals = {
        sessions: totalSessions,
        minutes: [...days.values()].reduce(
          (sum, r) => sum + r.strength.min + r.run.min + r.bike.min + r.other.min,
          0,
        ),
        distanceM: cardio.reduce((sum, c) => sum + (c.distanceM ?? 0), 0),
        kcal: cardio.reduce((sum, c) => sum + (c.calories ?? 0), 0),
        planned,
      }

      return {
        month: input.month,
        totals,
        days: [...days.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, r]) => ({ date, ...r })),
      }
    }),

  getPainEntries: coachStaffProcedure
    .input(
      z.object({
        patientId: z.string(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.getPainEntries' },
        req: ctx.req,
      })

      return ctx.prisma.painEntry.findMany({
        where: { userId: input.patientId },
        orderBy: { reportedAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          nrs: true,
          location: true,
          context: true,
          notes: true,
          reportedAt: true,
        },
      })
    }),

  // ── Voortgangsdata voor therapist ────────────────────────────────────────
  getProgress: coachStaffProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.getProgress' },
        req: ctx.req,
      })

      // Bron-of-truth (incl. cardio) gedeeld met PDF-export + mobiel.
      const { getPatientProgressData } = await import('@/lib/progress-data')
      return getPatientProgressData(ctx.prisma, input.patientId, 90)
    }),

  /**
   * HTML-rendering van het voortgangsrapport — bedoeld voor mbt-gym
   * (Expo `expo-print` rendert deze string naar PDF). Web gebruikt
   * `/print/progress/[patientId]` direct.
   */
  getProgressPdfHtml: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        /** Optionele vrije notitie van de behandelaar; verschijnt bovenaan in PDF. */
        note: z.string().max(4000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { id: true, name: true, email: true },
      })
      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }

      const { getPatientProgressData } = await import('@/lib/progress-data')
      const { getPatientRehabTrackerData } = await import('@/lib/rehab-data')
      const { renderProgressPdfHtml } = await import('@/lib/pdf/progress')
      const [progress, rehabTracker] = await Promise.all([
        getPatientProgressData(ctx.prisma, input.patientId),
        getPatientRehabTrackerData(ctx.prisma, input.patientId),
      ])

      await auditLog({
        event: 'DATA_EXPORTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientProgress',
        resourceId: input.patientId,
        metadata: {
          route: 'patients.getProgressPdfHtml',
          surface: 'mobile',
          hasRehabTracker: !!rehabTracker,
          hasNote: !!input.note,
        },
        req: ctx.req,
      })

      const html = renderProgressPdfHtml({
        progress: {
          patient: { name: patient.name, email: patient.email },
          generatedAt: new Date(),
          ...progress,
          rehabTracker,
          note: input.note ?? null,
        },
        autoPrint: false,
      })

      const safeName = (patient.name ?? patient.email).replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 60)
      return {
        html,
        // Gemak voor de mobile-client: gesuggereerde bestandsnaam voor het PDF.
        filenameHint: `voortgang-${safeName || 'patient'}-${new Date().toISOString().slice(0, 10)}.pdf`,
      }
    }),

  // Search binnen eigen gekoppelde patiënten. ADMIN mag globaal zoeken.
  // Eerder leverde deze endpoint PII van alle patiënten in de DB op — zie
  // security review #6.
  /** Laatste N gelogde sessies van deze patient, voor de geschiedenis-tab. */
  recentSessions: coachStaffProcedure
    .input(z.object({
      patientId: z.string(),
      limit: z.number().int().min(1).max(50).default(5),
      performedBy: z.enum(['all', 'patient', 'therapist']).default('all'),
    }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'SESSION_LOG_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.recentSessions', limit: input.limit, performedBy: input.performedBy },
        req: ctx.req,
      })

      // therapistId === patientId → patient logde zelf; anders (en niet null)
      // → therapeut logde namens. null = legacy en valt buiten beide filters.
      const performerWhere =
        input.performedBy === 'patient'
          ? { therapistId: input.patientId }
          : input.performedBy === 'therapist'
            ? { AND: [{ therapistId: { not: input.patientId } }, { therapistId: { not: null } }] }
            : {}

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId: input.patientId, status: 'COMPLETED', ...performerWhere },
        orderBy: { completedAt: 'desc' },
        take: input.limit,
        include: {
          program: { select: { id: true, name: true } },
          therapist: { select: { id: true, name: true } },
          exerciseLogs: {
            select: {
              id: true,
              exerciseId: true,
              setsCompleted: true,
              repsCompleted: true,
              repUnit: true,
              painLevel: true,
              weight: true,
              weightsPerSet: true,
              extraParams: true,
              supersetGroup: true,
              painDuring: true,
              notes: true,
            },
          },
        },
      })

      const exerciseIds = Array.from(new Set(sessions.flatMap((s) => s.exerciseLogs.map((el) => el.exerciseId))))
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]))

      return sessions.map((s) => ({
        id: s.id,
        completedAt: s.completedAt,
        durationMinutes: s.duration ? Math.round(s.duration / 60) : null,
        programName: s.program?.name ?? null,
        // Wie heeft de behandeling uitgevoerd? therapistId === patientId →
        // patient logde zelf (UI: "Patiënt zelf"). null → legacy log van
        // vóór deze feature (UI: "—"). Anders → therapeut-naam.
        therapistId: s.therapistId,
        therapistName: s.therapist?.name ?? null,
        painLevel: s.painLevel,
        exertionLevel: s.exertionLevel,
        feelScore: s.feelScore,
        notes: s.notes,
        exercises: s.exerciseLogs.map((el) => ({
          id: el.id,
          exerciseId: el.exerciseId,
          name: exerciseNameById.get(el.exerciseId) ?? 'Oefening',
          sets: el.setsCompleted,
          reps: el.repsCompleted,
          repUnit: el.repUnit,
          painLevel: el.painLevel,
          weight: el.weight,
          weightsPerSet: el.weightsPerSet,
          extraParams: el.extraParams,
          supersetGroup: el.supersetGroup,
          painDuring: el.painDuring,
          notes: el.notes,
        })),
      }))
    }),

  /**
   * Recent gelogde cardio-sessies van een patiënt/atleet. Aparte query van
   * recentSessions omdat cardio in een eigen tabel (CardioLog) zit met een
   * andere shape (tijd/afstand/tempo/HR/zone i.p.v. sets/reps/gewicht).
   */
  recentCardioSessions: coachStaffProcedure
    .input(z.object({
      patientId: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // Expliciete scalar-select: de wearables-migratie (CardioLog.source /
      // WorkoutSource enum) is nog niet op de DB toegepast, dus een impliciete
      // "alle kolommen"-select knalt op de ontbrekende `source`-kolom.
      const logs = await ctx.prisma.cardioLog.findMany({
        where: { patientId: input.patientId },
        orderBy: { completedAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          completedAt: true,
          activity: true,
          protocol: true,
          durationSec: true,
          distanceM: true,
          avgPaceSecPerKm: true,
          avgHeartRate: true,
          maxHeartRate: true,
          zone: true,
          targetZone: true,
          timeInZones: true,
          rpe: true,
          painLevel: true,
          notes: true,
          intervals: true,
          program: { select: { id: true, name: true } },
        },
      })
      return logs.map((l) => ({
        id: l.id,
        completedAt: l.completedAt,
        activity: l.activity,
        protocol: l.protocol,
        durationSec: l.durationSec,
        distanceM: l.distanceM,
        avgPaceSecPerKm: l.avgPaceSecPerKm,
        avgHeartRate: l.avgHeartRate,
        maxHeartRate: l.maxHeartRate,
        zone: l.zone,
        targetZone: l.targetZone,
        timeInZones: l.timeInZones,
        rpe: l.rpe,
        painLevel: l.painLevel,
        notes: l.notes,
        programName: l.program?.name ?? null,
        intervals: l.intervals,
      }))
    }),

  search: coachStaffProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // KRITIEK — zoekfilter en toegangscontrole moeten onder AND, niet als
      // twee `OR`-sleutels in hetzelfde object. Een object-spread overschrijft
      // een gelijknamige sleutel, dus `{ OR: [toegang], ...{ OR: [zoek] } }`
      // levert alléén het zoekfilter op en laat de scoping volledig vallen.
      // Dat lekte naam + e-mail van patiënten uit elke praktijk aan elke
      // therapeut of coach (audit 2026-07-27, H1).
      const queryFilter: Prisma.UserWhereInput = input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: 'insensitive' as const } },
              { email: { contains: input.query, mode: 'insensitive' as const } },
            ],
          }
        : {}

      const scopeFilter: Prisma.UserWhereInput =
        ctx.user.role === 'ADMIN'
          ? {}
          : {
              OR: [
                {
                  patientTherapists: {
                    some: {
                      therapistId: ctx.user.id,
                      isActive: true,
                      status: { in: ['APPROVED', 'PENDING'] },
                    },
                  },
                },
                ...practiceScope(ctx.user),
              ],
            }

      // Derde AND-tak, zelfde reden: uitbehandelde patiënten horen niet in een
      // kiezer waarmee je iets nieuws aan iemand hangt.
      const archiefFilter: Prisma.UserWhereInput = nietUitbehandeld(ctx.user)

      return ctx.prisma.user.findMany({
        where: {
          role: { in: ['PATIENT', 'ATHLETE'] },
          AND: [scopeFilter, queryFilter, archiefFilter],
        },
        select: { id: true, name: true, email: true },
        take: 20,
      })
    }),
})
