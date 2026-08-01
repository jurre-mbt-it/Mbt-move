/**
 * Rehab-protocol tRPC router.
 *
 * Therapist-facing stoplicht-tracker voor fasegebonden revalidatie-criteria.
 * Catalog-tabellen (RehabProtocol/Phase/Criterion) zijn admin-beheerd.
 * Therapeut activeert per patient en vinkt criteria R/O/G af.
 */
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, therapistProcedure, adminProcedure, mfaAdminProcedure } from '@/server/trpc'
import { practiceScope } from '@/server/lib/patient-access'
import { findOpenTracker, getPatientRehabTrackerData, getRehabTrackerDataById } from '@/lib/rehab-data'
import { laatsteAfgeslotenTraject } from '@/lib/rehab-traject'
import { notifyRehabCriterion, notifyRehabPhase } from '@/server/push/notify'
import { auditLog } from '@/server/audit'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  // Defense-in-depth: de praktijk-tak mag ALLEEN voor THERAPIST gelden
  // (patiënten/atleten delen de practiceId). Vangnet tegen toekomstige regressie.
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve behandelrelatie met deze patiënt' })
  }
  // Toegang = directe PatientTherapist-relatie OF zelfde praktijk.
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, ...ACTIVE_LINK } } },
        ...practiceScope(user),
      ],
    },
    select: { id: true },
  })
  if (!ok) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve behandelrelatie met deze patiënt',
    })
  }
}

/**
 * Het lopende traject van een patiënt, of een harde NOT_FOUND.
 *
 * De query zelf staat in `findOpenTracker` (@/lib/rehab-data), zodat er maar
 * één definitie is van "welk traject loopt er", inclusief volgorde. Deze
 * wrapper voegt alleen de fout toe. Wie null wil, roept `findOpenTracker`
 * rechtstreeks aan.
 *
 * Sinds het episode-model kan een patiënt meerdere trajecten hebben;
 * `deactivatedAt IS NULL` wijst het lopende aan en de partial unique index
 * patient_rehab_trackers_one_open_per_patient houdt dat er hoogstens één is.
 */
async function openTrackerFor(prisma: PrismaClient, patientId: string) {
  const tracker = await findOpenTracker(prisma, patientId)
  if (!tracker) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen lopend traject voor deze patiënt' })
  }
  return tracker
}

/**
 * Vertaal een unieke-index-botsing (Prisma P2002) naar een CONFLICT met een
 * melding die de therapeut iets zegt. Zonder deze vertaling komt de rauwe
 * databasefout bij de client terecht en toont de app alleen een algemene
 * "kon niet opslaan".
 *
 * Twee indexen kunnen hier klappen:
 *  - patient_rehab_trackers_one_open_per_patient, de partiële index die maar
 *    één open traject per patiënt toelaat. Elk pad dat een traject opent leest
 *    eerst of er al één loopt, en dat is read-then-write.
 *  - rehab_criterion_status_patientId_criterionId_key, de OUDE index die tot
 *    migratie C blijft staan. Zie de call-site in updateCriterionStatus.
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

const TRAJECT_AL_GESTART =
  'Er is zojuist al een traject gestart voor deze patiënt. Ververs het scherm en probeer het opnieuw.'

/**
 * Tracker-state laden — pure logica zit in `@/lib/rehab-data` zodat
 * PDF-export en deze router exact dezelfde shape teruggeven.
 */
const loadTrackerState = getPatientRehabTrackerData

export const rehabRouter = createTRPCRouter({
  /** Lijst van beschikbare protocollen in de catalog. */
  listProtocols: therapistProcedure.query(async ({ ctx }) => {
    return ctx.prisma.rehabProtocol.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        specialty: true,
        sourceReference: true,
      },
    })
  }),

  /**
   * Volledige tracker-state voor een patiënt: actief protocol + alle fases met
   * criteria + per-criterium status + berekende expected-phase op basis van
   * operatiedatum.
   */
  getPatientTracker: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      return loadTrackerState(ctx.prisma, input.patientId)
    }),

  /**
   * Read-only tracker voor de ingelogde patient zelf. Geen edit-mutations
   * gekoppeld — patient ziet alleen status-kleuren, geen measurement-dialogs.
   */
  getMyTracker: protectedProcedure.query(async ({ ctx }) => {
    return loadTrackerState(ctx.prisma, ctx.user.id)
  }),

  /**
   * Voor de patiënt-client: heeft dit account een recent AFGESLOTEN traject,
   * en zo ja, welk protocol was dat en wanneer liep het.
   *
   * Bestaat apart van `getMyTracker`, want die geeft `null` in twee
   * volstrekt verschillende gevallen: nooit een protocol gehad, en er net
   * één afgerond. `getMyTracker` blijft daarom exact zoals hij is, ook qua
   * vorm van zijn `null`: build 78 (App Store, geen version-gate) rendert
   * een niet-lege tracker als het LOPENDE protocol met alle fases, dus een
   * afgesloten traject teruggeven op die plek zou de app een afgeronde
   * revalidatie als actief protocol tonen. Zie ook de toelichting bij
   * `deactivatedAt` in `getRehabTrackerDataById` (@/lib/rehab-data): dezelfde
   * "wat mag een patiënt zien"-afweging, hier toegepast op een nieuwe query
   * in plaats van op een bestaand veld.
   *
   * Geen `patientId` in de input: alleen het eigen account, nooit dat van
   * iemand anders. Kiezen tussen "loopt er nog iets" en "wat was het laatst
   * afgeslotene" staat in `laatsteAfgeslotenTraject` (@/lib/rehab-traject),
   * zodat die beslissing zonder database te testen is.
   *
   * Bewust NIET in de returnvorm, en waarom:
   *  - `outcomeNote`: klinische vrije tekst van de therapeut. Staat om
   *    dezelfde reden al niet in de gedeelde vorm in @/lib/rehab-data.
   *  - `outcome`: de uitkomst is een klinisch oordeel (COMPLETED t/m
   *    RELAPSE). "Terugval" als conclusie van zijn eigen traject op het
   *    toestel van de patiënt zetten is niet aan de app; dat hoort in een
   *    gesprek, niet in een tegel.
   *  - criteria en voortgang: die horen bij het lopende traject, niet bij
   *    de mededeling dat er een is afgesloten.
   *  - `closedById`: wie het dossier sloot is een interne handeling.
   */
  getMyLastClosedTraject: protectedProcedure.query(async ({ ctx }) => {
    const trajecten = await ctx.prisma.patientRehabTracker.findMany({
      where: { patientId: ctx.user.id },
      select: {
        id: true,
        activatedAt: true,
        deactivatedAt: true,
        protocol: { select: { name: true } },
      },
    })
    const laatste = laatsteAfgeslotenTraject(trajecten)
    if (!laatste) return null
    return {
      protocolName: laatste.protocol.name,
      activatedAt: laatste.activatedAt,
      deactivatedAt: laatste.deactivatedAt,
    }
  }),

  activateForPatient: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        protocolId: z.string(),
        surgeryDate: z.string().nullable().optional(),
        injuryDate: z.string().nullable().optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)

      const protocol = await ctx.prisma.rehabProtocol.findUnique({
        where: { id: input.protocolId },
      })
      if (!protocol || !protocol.isActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Protocol bestaat niet of is inactief' })
      }

      const surgeryDate = input.surgeryDate ? new Date(input.surgeryDate) : null
      const injuryDate = input.injuryDate ? new Date(input.injuryDate) : null

      const bestaand = await findOpenTracker(ctx.prisma, input.patientId)

      // Drie takken, omdat de iOS-app dit ene endpoint voor twee dingen gebruikt.
      // In mbt-gym-mobile/components/rehab-section.tsx opent de WIJZIG-link naast
      // een lopend traject exact dezelfde sheet als "protocol aanzetten", en die
      // sheet roept altijd activateForPatient aan. Build 78 heeft geen
      // version-gate en geen OTA, dus een harde fout op een lopend traject zou
      // zowel het bijwerken van datums/notitie als het overstappen slopen.
      const nieuwTraject = {
        patientId: input.patientId,
        protocolId: input.protocolId,
        activatedById: ctx.user.id,
        surgeryDate,
        injuryDate,
        // `notes` is in zod .optional() en niet nullable. Bij een create is dat
        // geen probleem meer: elk traject begint met zijn eigen notitie.
        notes: input.notes ?? null,
      }

      // 1. Geen lopend traject: gewoon starten.
      if (!bestaand) {
        const gestart = await ctx.prisma.patientRehabTracker
          .create({ data: nieuwTraject })
          .catch(alsConflict(TRAJECT_AL_GESTART))
        await auditLog({
          event: 'REHAB_TRAJECT_STARTED',
          userId: ctx.user.id,
          actorEmail: ctx.user.email,
          resource: 'PatientRehabTracker',
          resourceId: gestart.id,
          // Vaste waarden en IDs, geen vrije tekst (audit.ts:7-8).
          metadata: {
            route: 'rehab.activateForPatient',
            reason: 'NEW',
            protocolId: input.protocolId,
          },
          req: ctx.req,
        })
        return { ok: true }
      }

      // 2. Zelfde protocol: dit is "wijzigen", geen nieuw traject. Alleen de
      // meegestuurde velden bijwerken. `activatedAt` en `activatedById` blijven
      // staan, anders zou een notitie-edit de startdatum en daarmee de
      // weken-sinds-operatie verschuiven.
      //
      // Een expliciete `null` betekent hier "niet wijzigen", niet "leegmaken".
      // Reden: iOS-builds tot en met 78 openen voor WIJZIG dezelfde sheet als
      // voor aanzetten, die sheet vult zichzelf NIET voor met de bestaande
      // tracker, en stuurt surgeryDate en injuryDate altijd mee, standaard op
      // null. Zou null hier leegmaken, dan wist een therapeut die alleen een
      // notitie toevoegt de operatiedatum, en daarmee `weeksSinceSurgery` en de
      // fase-indicatie. Een check op `!== undefined` helpt niet: die builds
      // sturen echt null.
      //
      // DIE BUILDS BLIJVEN IN OMLOOP; er is geen version-gate en geen OTA, dus
      // deze coulance kan niet weg zolang 78 nog draait.
      //
      // Vanaf build 79 vult de app de sheet wél voor, en dan is deze coulance
      // juist verkeerd: leegmaken en van OPERATIE naar BLESSURE wisselen zijn
      // dan zichtbare handelingen die stil zouden verdampen. Die build stuurt
      // een wijziging aan hetzelfde protocol daarom naar `updateTrackerDetails`
      // hieronder, waar null WEL leegmaakt. Zelfde afspraak als de web-UI, die
      // het formulier ook voorinvult. `activateForPatient` blijft daar voor
      // aanzetten en voor het wisselen van protocol.
      if (bestaand.protocolId === input.protocolId) {
        await ctx.prisma.patientRehabTracker.update({
          where: { id: bestaand.id },
          data: {
            ...(surgeryDate ? { surgeryDate } : {}),
            ...(injuryDate ? { injuryDate } : {}),
            notes: input.notes,
          },
        })
        return { ok: true }
      }

      // 3. Ander protocol: dit is "overstappen". Vroeger overschreef de upsert
      // het lopende traject stil; nu sluiten we het af en start er een nieuw
      // traject naast, zodat de historie en de oude vinkjes bewaard blijven.
      // In één transactie, want de partial unique index laat geen tweede open
      // traject toe.
      const [, nieuw] = await ctx.prisma
        .$transaction([
          ctx.prisma.patientRehabTracker.update({
            where: { id: bestaand.id },
            data: {
              deactivatedAt: new Date(),
              closedById: ctx.user.id,
              // Afgesloten door een protocolwissel, niet door een therapeut die
              // een uitkomst koos. UNKNOWN tot iemand dat alsnog invult.
              outcome: 'UNKNOWN',
            },
          }),
          ctx.prisma.patientRehabTracker.create({ data: nieuwTraject }),
        ])
        .catch(alsConflict(TRAJECT_AL_GESTART))

      // Dit sluit een klinische episode af, net als closeTraject, alleen zonder
      // dat iemand een uitkomst koos. Zelfde event, zodat het spoor compleet is.
      await auditLog({
        event: 'REHAB_TRAJECT_CLOSED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientRehabTracker',
        resourceId: bestaand.id,
        // Vaste waarden en IDs, geen vrije tekst (audit.ts:7-8).
        metadata: {
          route: 'rehab.activateForPatient',
          reason: 'PROTOCOL_SWITCH',
          outcome: 'UNKNOWN',
          newTrackerId: nieuw.id,
        },
        req: ctx.req,
      })
      // En het starten van de vervangende episode, zodat elk traject in het
      // spoor een begin én een eind heeft.
      await auditLog({
        event: 'REHAB_TRAJECT_STARTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientRehabTracker',
        resourceId: nieuw.id,
        metadata: {
          route: 'rehab.activateForPatient',
          reason: 'PROTOCOL_SWITCH',
          protocolId: input.protocolId,
          previousTrackerId: bestaand.id,
        },
        req: ctx.req,
      })
      return { ok: true }
    }),

  deactivateForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      // Stil slagen als er niets loopt, dus geen openTrackerFor. Dit is een
      // "zet uit"-knop en die is idempotent: tikken twee therapeuten tegelijk
      // op STOPPEN, dan krijgt de tweede anders "Mislukt, kon het protocol niet
      // stoppen" terwijl het traject wel degelijk gesloten is. Dat was ook het
      // gedrag vóór het episode-model.
      const tracker = await findOpenTracker(ctx.prisma, input.patientId)
      if (!tracker) return { ok: true }
      await ctx.prisma.patientRehabTracker.update({
        where: { id: tracker.id },
        data: { deactivatedAt: new Date(), closedById: ctx.user.id },
      })
      // Ook dit sluit een episode af, alleen zonder uitkomst: build 78 kent
      // closeTraject nog niet en zet het protocol hiermee uit.
      await auditLog({
        event: 'REHAB_TRAJECT_CLOSED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientRehabTracker',
        resourceId: tracker.id,
        metadata: { route: 'rehab.deactivateForPatient', reason: 'DEACTIVATED' },
        req: ctx.req,
      })
      return { ok: true }
    }),

  // ── Trajecten: afsluiten, heropenen, teruglezen ──────────────────────────

  /**
   * Sluit het lopende traject af met een uitkomst. Anders dan
   * `deactivateForPatient` legt dit vast HOE het traject eindigde; de
   * toelichting is vrije tekst en blijft daarom op de rij staan, niet in de
   * audit-metadata.
   */
  closeTraject: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        outcome: z.enum(['COMPLETED', 'DISCONTINUED', 'TRANSFERRED', 'RELAPSE', 'UNKNOWN']),
        outcomeNote: z.string().max(2000).optional(),
        /**
         * Het traject dat de therapeut op zijn scherm had (`trackerId` uit
         * `getPatientTracker`). Optioneel, want de iOS-app kent het veld niet.
         */
        expectedTrackerId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const tracker = await openTrackerFor(ctx.prisma, input.patientId)
      // Zonder deze check sluit je "het open traject van deze patiënt" af, en
      // dat hoeft niet het traject te zijn dat je voor je had: switcht een
      // collega ondertussen van protocol, dan landt jouw uitkomst op de nieuwe
      // episode terwijl de oude als UNKNOWN in de historie blijft staan.
      if (input.expectedTrackerId && input.expectedTrackerId !== tracker.id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Het traject van deze patiënt is inmiddels gewijzigd. Ververs het scherm en kies de uitkomst opnieuw.',
        })
      }
      const closed = await ctx.prisma.patientRehabTracker.update({
        where: { id: tracker.id },
        data: {
          deactivatedAt: new Date(),
          closedById: ctx.user.id,
          outcome: input.outcome,
          outcomeNote: input.outcomeNote ?? null,
        },
      })
      await auditLog({
        event: 'REHAB_TRAJECT_CLOSED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientRehabTracker',
        resourceId: tracker.id,
        // Geen vrije tekst: audit.ts:7-8 verbiedt PII in metadata. De
        // toelichting staat op de rij zelf, achter RLS.
        metadata: { route: 'rehab.closeTraject', outcome: input.outcome },
        req: ctx.req,
      })
      return closed
    }),

  /**
   * Draai een afsluiting terug. Alleen als er niets anders loopt: de partiële
   * index laat maar één open traject toe.
   *
   * In principe alleen voor het laatste traject, met één uitzondering: een
   * nieuwer traject waarop niets is vastgelegd (geen criteriumstatus, geen
   * notitie, geen uitkomst) wordt opgeruimd. Dat is de misklik in de
   * protocolkiezer, en zonder die uitzondering blijft die permanent in het
   * dossier staan.
   */
  reopenTraject: therapistProcedure
    .input(z.object({ trackerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tracker = await ctx.prisma.patientRehabTracker.findUnique({
        where: { id: input.trackerId },
      })
      if (!tracker) throw new TRPCError({ code: 'NOT_FOUND' })
      // Autoriseer op tracker.patientId, nooit op een meegestuurde patientId:
      // anders is een trackerId genoeg om een dossier uit een andere praktijk
      // te openen.
      await assertTreating(ctx.prisma, ctx.user, tracker.patientId)

      if (!tracker.deactivatedAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Dit traject loopt al.' })
      }

      const nieuwere = await ctx.prisma.patientRehabTracker.findMany({
        where: {
          patientId: tracker.patientId,
          // Zelfde volgorde-sleutel als findOpenTracker: bij een gelijke
          // activatedAt beslist het id, anders zou "nieuwer" bij een gelijkspel
          // niets vinden en heropen je alsnog een oudere episode.
          OR: [
            { activatedAt: { gt: tracker.activatedAt } },
            { activatedAt: tracker.activatedAt, id: { gt: tracker.id } },
          ],
        },
        select: {
          id: true,
          outcome: true,
          outcomeNote: true,
          notes: true,
          _count: { select: { statuses: true } },
        },
      })
      // Een misklik in de protocolkiezer sluit het lopende traject af en opent
      // meteen een nieuw, leeg traject. Zonder uitzondering hieronder zou dat
      // permanent zijn: heropenen weigert vanwege het nieuwere traject, en er
      // is geen procedure die een tracker verwijdert. In een medisch dossier
      // blijft dan een afgesloten echt traject plus een spookepisode staan.
      //
      // "Leeg" is meer dan nul criteriumstatussen. `notes` is vrije tekst tot
      // 2000 tekens die bij elke create meegegeven kan zijn en via
      // updateTrackerDetails bewerkbaar is, en `outcome`/`outcomeNote` leggen
      // vast hoe een episode eindigde. Een traject waar een therapeut een
      // notitie in typte maar nog niets afvinkte is dus geen spookepisode.
      // Alle vier moeten leeg zijn voordat er iets verdwijnt. Datums vallen er
      // bewust buiten: die worden bij het aanmaken meegegeven en zeggen op
      // zichzelf niets over ingevoerd werk.
      const isLeeg = (t: (typeof nieuwere)[number]) =>
        t._count.statuses === 0 &&
        t.outcome === null &&
        t.outcomeNote === null &&
        t.notes === null
      if (nieuwere.some((t) => !isLeeg(t))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Er is al een nieuwer traject gestart. Dit traject kan niet meer heropend worden.',
        })
      }
      const legeIds = new Set(nieuwere.map((t) => t.id))
      const open = await findOpenTracker(ctx.prisma, tracker.patientId)
      // Een open traject dat we hieronder toch weggooien telt niet mee.
      if (open && !legeIds.has(open.id)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Er loopt al een traject voor deze patiënt.' })
      }
      // In één transactie: eerst de lege episodes weg, dan pas heropenen. Was
      // een van die lege episodes het open traject, dan geeft alleen deze
      // volgorde de partiële unique index op tijd vrij.
      //
      // Interactieve transactie, geen array: bij een afwijkende telling moet
      // ook het heropenen terugdraaien.
      //
      // De DELETE herhaalt de leeg-voorwaarden in zijn eigen where. De telling
      // hierboven is read-then-write, en een collega met praktijk-brede toegang
      // kan er tussendoor een criterium op aanvinken; RehabCriterionStatus
      // hangt met onDelete: Cascade aan de tracker, dus die beoordeling zou
      // stil meeverdwijnen. Nu slaat de DELETE zo'n rij over, wijkt `count` af
      // van wat we wilden verwijderen, en rolt de hele transactie terug.
      const reopened = await ctx.prisma
        .$transaction(async (tx) => {
          const verwijderd = await tx.patientRehabTracker.deleteMany({
            where: {
              id: { in: [...legeIds] },
              statuses: { none: {} },
              outcome: null,
              outcomeNote: null,
              notes: null,
            },
          })
          if (verwijderd.count !== legeIds.size) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'Er is inmiddels iets vastgelegd op het nieuwere traject van deze patiënt. Ververs het scherm en probeer het opnieuw.',
            })
          }
          return tx.patientRehabTracker.update({
            where: { id: tracker.id },
            data: { deactivatedAt: null, closedById: null, outcome: null, outcomeNote: null },
          })
        })
        .catch(alsConflict(TRAJECT_AL_GESTART))
      await auditLog({
        event: 'REHAB_TRAJECT_REOPENED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PatientRehabTracker',
        resourceId: tracker.id,
        // Alleen vaste waarden en IDs (audit.ts:7-8). De ids van de verwijderde
        // episodes horen erbij, niet alleen hun aantal: dit is de enige plek
        // waar na een harde delete van dossierrijen nog staat wélke rijen dat
        // waren.
        metadata: {
          route: 'rehab.reopenTraject',
          removedEmptyTrackers: legeIds.size,
          removedTrackerIds: [...legeIds],
        },
        req: ctx.req,
      })
      return reopened
    }),

  /** Historie: alle trajecten van een patiënt, nieuwste eerst. */
  listTrajects: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const trackers = await ctx.prisma.patientRehabTracker.findMany({
        where: { patientId: input.patientId },
        orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
        include: {
          protocol: { select: { name: true, phases: { select: { criteria: { select: { id: true } } } } } },
          statuses: { select: { status: true } },
        },
      })
      return trackers.map((t) => ({
        id: t.id,
        protocolName: t.protocol.name,
        activatedAt: t.activatedAt,
        deactivatedAt: t.deactivatedAt,
        outcome: t.outcome,
        outcomeNote: t.outcomeNote,
        behaaldeCriteria: t.statuses.filter((s) => s.status === 'MET').length,
        totaalCriteria: t.protocol.phases.reduce((n, f) => n + f.criteria.length, 0),
      }))
    }),

  /**
   * Eén traject uit de historie, in dezelfde vorm als `getPatientTracker`,
   * plus de toelichting bij de afsluiting. Aparte procedurenaam, want
   * `getMyTracker`/`getPatientTracker` moeten één object of null blijven
   * teruggeven voor de app.
   */
  getTraject: therapistProcedure
    .input(z.object({ trackerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tracker = await ctx.prisma.patientRehabTracker.findUnique({
        where: { id: input.trackerId },
        select: { id: true, patientId: true, outcomeNote: true },
      })
      if (!tracker) throw new TRPCError({ code: 'NOT_FOUND' })
      // Autoriseren op de patientId van de RIJ, niet op input.
      await assertTreating(ctx.prisma, ctx.user, tracker.patientId)
      const data = await getRehabTrackerDataById(ctx.prisma, tracker.id)
      if (!data) return null
      // `outcomeNote` komt hier bovenop de gedeelde vorm en niet uit
      // `@/lib/rehab-data`. Die vorm voedt ook het patiënt-facing
      // `getMyTracker`, en klinische vrije tekst hoort daar niet in. Deze
      // procedure draait op therapistProcedure, dus hier mag het wel.
      return { ...data, outcomeNote: tracker.outcomeNote }
    }),

  /**
   * Bewerk alleen de data-velden van de tracker (operatiedatum, blessuredatum,
   * notities). Protocol switchen gaat via activateForPatient.
   */
  updateTrackerDetails: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        surgeryDate: z.string().nullable().optional(),
        injuryDate: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const tracker = await openTrackerFor(ctx.prisma, input.patientId)
      await ctx.prisma.patientRehabTracker.update({
        where: { id: tracker.id },
        data: {
          ...(input.surgeryDate !== undefined
            ? { surgeryDate: input.surgeryDate ? new Date(input.surgeryDate) : null }
            : {}),
          ...(input.injuryDate !== undefined
            ? { injuryDate: input.injuryDate ? new Date(input.injuryDate) : null }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      })
      return { ok: true }
    }),

  /** Upsert van de status voor één criterium. */
  updateCriterionStatus: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        criterionId: z.string(),
        status: z.enum(['NOT_MET', 'IN_PROGRESS', 'MET']),
        measurementValue: z.string().nullable().optional(),
        measurementDate: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)

      // Defensief: zorg dat dit criterium hoort bij het protocol van het lopende
      // traject. Op het traject vergelijken, niet op de patiënt: anders schrijf
      // je een criterium van traject A weg in traject B.
      const tracker = await openTrackerFor(ctx.prisma, input.patientId)
      const criterion = await ctx.prisma.rehabCriterion.findUnique({
        where: { id: input.criterionId },
        include: { phase: true },
      })
      if (!criterion || criterion.phase.protocolId !== tracker.protocolId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Criterium hoort niet bij dit traject' })
      }

      const measurementDate = input.measurementDate ? new Date(input.measurementDate) : null

      // Vorige status onthouden zodat we alleen bij de ECHTE overgang naar MET
      // een melding sturen (niet bij het opnieuw opslaan van een al-behaald
      // criterium of een meetwaarde-edit).
      const prevStatus = await ctx.prisma.rehabCriterionStatus.findUnique({
        where: {
          trackerId_criterionId: {
            trackerId: tracker.id,
            criterionId: input.criterionId,
          },
        },
        select: { status: true },
      })

      // De upsert kijkt naar (trackerId, criterionId), maar tot migratie C staat
      // de OUDE index rehab_criterion_status_patientId_criterionId_key er nog
      // naast. Scenario in dat venster: traject afsluiten, hetzelfde protocol
      // opnieuw starten, eerste criterium aanvinken. De upsert vindt geen rij op
      // het nieuwe traject, doet dus een create, en botst op de oude rij van het
      // vorige traject. Zonder deze vertaling is dat een rauwe 23505 op het
      // scherm van de therapeut.
      await ctx.prisma.rehabCriterionStatus
        .upsert({
          where: {
            trackerId_criterionId: {
              trackerId: tracker.id,
              criterionId: input.criterionId,
            },
          },
          update: {
            status: input.status,
            measurementValue: input.measurementValue ?? null,
            measurementDate,
            notes: input.notes ?? null,
            updatedById: ctx.user.id,
          },
          create: {
            trackerId: tracker.id,
            criterionId: input.criterionId,
            status: input.status,
            measurementValue: input.measurementValue ?? null,
            measurementDate,
            notes: input.notes ?? null,
            updatedById: ctx.user.id,
          },
        })
        .catch(
          alsConflict(
            'Dit criterium staat nog geregistreerd op een eerder traject van deze patiënt, waardoor het nu niet opgeslagen kan worden. Meld het bij de beheerder als dit blijft terugkomen.',
          ),
        )

      // Melding aan de patiënt bij de overgang naar MET. Faalt nooit de mutatie.
      if (input.status === 'MET' && prevStatus?.status !== 'MET') {
        await notifyRehabCriterion(input.patientId).catch(() => {})

        // Fase compleet? Als álle criteria van deze fase nu MET zijn én er een
        // volgende fase bestaat, ook een fase-overgang-melding sturen.
        const phaseCriteria = await ctx.prisma.rehabCriterion.findMany({
          where: { phaseId: criterion.phaseId },
          select: { id: true },
        })
        // Op trackerId tellen: anders tellen vinkjes uit een afgesloten traject
        // mee en krijgt de patiënt bij een nieuw traject meteen een onterechte
        // "fase behaald"-melding.
        const metCount = await ctx.prisma.rehabCriterionStatus.count({
          where: {
            trackerId: tracker.id,
            criterionId: { in: phaseCriteria.map((c) => c.id) },
            status: 'MET',
          },
        })
        if (phaseCriteria.length > 0 && metCount === phaseCriteria.length) {
          const nextPhase = await ctx.prisma.rehabPhase.findFirst({
            where: {
              protocolId: criterion.phase.protocolId,
              order: { gt: criterion.phase.order },
            },
            select: { id: true },
          })
          if (nextPhase) await notifyRehabPhase(input.patientId).catch(() => {})
        }
      }

      return { ok: true }
    }),

  // ── ADMIN-ONLY: protocol catalog management ──────────────────────────────

  /** Admin: lijst alle protocollen incl. tellingen, actief + inactief. */
  adminListProtocols: adminProcedure.query(async ({ ctx }) => {
    const protocols = await ctx.prisma.rehabProtocol.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { phases: true, trackers: true } },
        phases: {
          select: { _count: { select: { criteria: true } } },
        },
      },
    })
    return protocols.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      specialty: p.specialty,
      sourceReference: p.sourceReference,
      isActive: p.isActive,
      phaseCount: p._count.phases,
      trackerCount: p._count.trackers,
      criteriaCount: p.phases.reduce((sum, ph) => sum + ph._count.criteria, 0),
    }))
  }),

  /** Admin: volledig protocol-detail incl alle phases en criteria. */
  adminGetProtocol: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.prisma.rehabProtocol.findUnique({
        where: { id: input.id },
        include: {
          phases: {
            orderBy: { order: 'asc' },
            include: { criteria: { orderBy: { order: 'asc' } } },
          },
        },
      })
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' })
      return p
    }),

  adminUpdateProtocol: mfaAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        description: z.string().max(2000).nullable().optional(),
        specialty: z.string().min(1).optional(),
        sourceReference: z.string().max(500).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      await ctx.prisma.rehabProtocol.update({
        where: { id },
        data: patch,
      })
      return { ok: true }
    }),

  adminCreateProtocol: mfaAdminProcedure
    .input(
      z.object({
        key: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Key: alleen lowercase + cijfers + streepjes'),
        name: z.string().min(2),
        description: z.string().max(2000).optional(),
        specialty: z.string().min(1),
        sourceReference: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const p = await ctx.prisma.rehabProtocol.create({
        data: { ...input, isActive: true },
      })
      return { id: p.id }
    }),

  adminDeleteProtocol: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // De FK van tracker naar protocol staat op Prisma-default Restrict, dus
      // ELK traject blokkeert de delete, ook een afgesloten. Alleen op lopende
      // trajecten guarden zou de admin op een rauwe foreign-key-fout laten
      // landen. Beide tellen, en de melding zegt welk geval het is.
      const [lopend, totaal] = await Promise.all([
        ctx.prisma.patientRehabTracker.count({
          where: { protocolId: input.id, deactivatedAt: null },
        }),
        ctx.prisma.patientRehabTracker.count({
          where: { protocolId: input.id },
        }),
      ])
      if (lopend > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Protocol wordt gebruikt door ${lopend} lopend(e) traject(en). Sluit die eerst af of zet isActive op false.`,
        })
      }
      if (totaal > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Dit protocol heeft historie (${totaal} afgesloten traject(en)) en kan niet verwijderd worden. Zet isActive op false.`,
        })
      }
      await ctx.prisma.rehabProtocol.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // Criteria CRUD (phase toevoegen laten we voor nu uit scope — fases komen via seed)

  adminUpdateCriterion: mfaAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        testDescription: z.string().min(2).optional(),
        reference: z.string().nullable().optional(),
        targetValue: z.string().min(1).optional(),
        targetUnit: z.string().nullable().optional(),
        inputType: z.enum(['NUMERIC', 'TEXT', 'PASS_FAIL']).optional(),
        isBonus: z.boolean().optional(),
        isBilateral: z.boolean().optional(),
        newtonMinGreen: z.number().int().nullable().optional(),
        newtonMinOrange: z.number().int().nullable().optional(),
        lsiMinGreen: z.number().int().min(0).max(100).nullable().optional(),
        lsiMinOrange: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      await ctx.prisma.rehabCriterion.update({ where: { id }, data: patch })
      return { ok: true }
    }),

  adminCreateCriterion: mfaAdminProcedure
    .input(
      z.object({
        phaseId: z.string(),
        name: z.string().min(2),
        testDescription: z.string().min(2),
        reference: z.string().optional(),
        targetValue: z.string().min(1),
        targetUnit: z.string().optional(),
        inputType: z.enum(['NUMERIC', 'TEXT', 'PASS_FAIL']).default('NUMERIC'),
        isBonus: z.boolean().default(false),
        isBilateral: z.boolean().default(false),
        newtonMinGreen: z.number().int().optional(),
        newtonMinOrange: z.number().int().optional(),
        lsiMinGreen: z.number().int().min(0).max(100).optional(),
        lsiMinOrange: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const maxOrder = await ctx.prisma.rehabCriterion.findFirst({
        where: { phaseId: input.phaseId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const order = (maxOrder?.order ?? -1) + 1
      const { phaseId, ...rest } = input
      const c = await ctx.prisma.rehabCriterion.create({
        data: { phaseId, order, ...rest },
      })
      return { id: c.id }
    }),

  adminDeleteCriterion: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.rehabCriterion.delete({ where: { id: input.id } })
      return { ok: true }
    }),
})
