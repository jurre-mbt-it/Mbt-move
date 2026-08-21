# Revalidatietraject-startflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De hybride startflow uit `docs/superpowers/specs/2026-08-21-revalidatietraject-start-flow-design.md`: traject-dialoog direct na patiënt aanmaken, checklist-kaart op de patiëntpagina, en de koppeling RehabCriterion ↔ TestCatalogItem zodat één meting in een testrapport automatisch het protocol-criterium bijwerkt.

**Architecture:** Twee nullable kolommen (additief, geen nieuwe tabellen), een pure statusberekening in `src/lib/`, een server-side sync-helper die vanuit `testReports.updateEntry` criteria bijwerkt, en UI-wijzigingen op drie bestaande schermen (patiëntenlijst, patiëntpagina, admin-protocolbeheer). Alles server-side additief: iOS-builds t/m 79 blijven werken.

**Tech Stack:** Next.js App Router, tRPC, Prisma (hosted Supabase, geen dev-DB), vitest, dark-ui componenten.

## Global Constraints

- **Lees `AGENTS.md` in de repo-root vóór je begint.** Alle regels daar gelden, in het bijzonder:
  - Hardcode nooit `/therapist/...` in gedeelde pagina's; links via `usePortal()` uit `src/lib/portal.ts` (`portal.base`, `portal.patients`).
  - UI-copy volgt `docs/tone-of-voice.md`: geen em-dashes, geen holle marketingwoorden. Interpunctie in copy: `·` en gewone zinnen.
  - Invoervelden nooit corrigeren tijdens het typen (hier alleen relevant voor bestaande datumvelden; niet aanpassen).
  - Nieuwe tabellen vereisen RLS in dezelfde migratie. **Dit plan maakt geen nieuwe tabellen**, alleen nullable kolommen op bestaande tabellen die al RLS deny-all hebben; er is dus geen RLS-werk.
- **Server-contracten additief**: geen bestaande input verplicht maken, geen bestaande output-velden hernoemen of verwijderen. iOS-builds t/m 79 draaien zonder version-gate tegen deze server.
- DB-wijzigingen gaan met `npx prisma db push` tegen de gehoste Supabase-DB (er is geen aparte dev-DB; dit is de bestaande conventie). Alleen additieve nullable kolommen in dit plan.
- `RehabCriterionStatusValue` is `NOT_MET | IN_PROGRESS | MET`. Testrapport-zones zijn `RED | ORANGE | GREEN`. Mapping: `GREEN→MET`, `ORANGE→IN_PROGRESS`, `RED→NOT_MET`.
- Tests draaien met `npm test` (vitest). Typecheck met `npx tsc --noEmit`.
- Commits in het Nederlands, conventional prefix (`feat(...)`, `docs(...)`), afgesloten met `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Een `graphify`-hook kan bij Read/Grep vragen om eerst `graphify query "<vraag>"` te draaien; doe dat kort en ga door.

---

### Task 1: Schema — koppelkolommen

**Files:**
- Modify: `prisma/schema.prisma` (modellen `RehabCriterion` ~L1501, `RehabCriterionStatus` ~L1565, `TestCatalogItem` ~L2149, `TestReportEntry` ~L2262)

**Interfaces:**
- Produces: `RehabCriterion.catalogItemId: String?` + relatie `catalogItem`, `RehabCriterionStatus.reportEntryId: String?` + relatie `reportEntry`. Latere tasks gebruiken deze veldnamen exact.

- [ ] **Step 1: Kolommen toevoegen in schema.prisma**

In `model RehabCriterion`, direct na de bestaande `lsiMinOrange Int?`-regel:

```prisma
  /// Optionele koppeling aan een globale catalogus-test (practiceId NULL).
  /// Gezet: een meting van die test in een testrapport werkt dit criterium
  /// automatisch bij (src/server/lib/rehab-criterion-sync.ts). NULL: criterium
  /// blijft puur handmatig afvinkbaar.
  catalogItemId String?
  catalogItem   TestCatalogItem? @relation(fields: [catalogItemId], references: [id], onDelete: SetNull)
```

In `model RehabCriterionStatus`, na `notes String?`:

```prisma
  /// Herkomst van een automatisch gezette status: de rapport-meting die dit
  /// criterium kleurde. NULL bij handmatig gezette statussen. SetNull zodat
  /// het verwijderen van een rapport de klinische registratie laat staan.
  reportEntryId String?
  reportEntry   TestReportEntry? @relation(fields: [reportEntryId], references: [id], onDelete: SetNull)
```

In `model TestCatalogItem`, bij de bestaande relatievelden (`batteryItems`/`reportEntries`):

```prisma
  rehabCriteria RehabCriterion[]
```

In `model TestReportEntry`, bij de relatievelden:

```prisma
  criterionStatuses RehabCriterionStatus[]
```

- [ ] **Step 2: Valideren en pushen**

Run: `npx prisma validate` → verwacht: "The schema ... is valid".
Run: `npx prisma db push` → verwacht: alleen ADD COLUMN-statements, geen drops. Bij een waarschuwing over data-verlies: STOP en meld het (dat hoort niet bij additieve nullable kolommen).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → verwacht: schoon (Prisma-client is geregenereerd door db push).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(rehab): criteria kennen de test-library (catalogItemId + herkomst op status)"
```

---

### Task 2: Pure statusberekening (TDD)

**Files:**
- Create: `src/lib/rehab-criterion-status.ts`
- Test: `src/lib/__tests__/rehab-criterion-status.test.ts`

**Interfaces:**
- Consumes: `TestSpec`, `TestValues`, `computeLsi`, `computePlottedValue`, `computeZone`, `formatPlotted`, `formatNumber` uit `@/lib/test-report/compute` (bestaand).
- Produces: `bepaalCriteriumStatus(drempels, spec, values)` → `{ status: 'NOT_MET' | 'IN_PROGRESS' | 'MET'; samenvatting: string } | null`. Task 3 roept dit exact zo aan.

- [ ] **Step 1: Schrijf de failing tests**

`src/lib/__tests__/rehab-criterion-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bepaalCriteriumStatus, type CriteriumDrempels } from '../rehab-criterion-status'
import type { TestSpec } from '../test-report/compute'

const lsiSpec: TestSpec = {
  kind: 'BILATERAL', metric: 'LSI', plotUnit: '%',
  axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90, higherIsBetter: true,
}
const valueSpec: TestSpec = {
  kind: 'SINGLE', metric: 'VALUE', plotUnit: 'cm',
  axisMin: 0, axisMax: 15, zoneOrangeMin: 8, zoneGreenMin: 10, higherIsBetter: true,
}
const geenDrempels: CriteriumDrempels = {
  isBilateral: false, newtonMinGreen: null, newtonMinOrange: null,
  lsiMinGreen: null, lsiMinOrange: null,
}
const bilateraal: CriteriumDrempels = {
  isBilateral: true, newtonMinGreen: 400, newtonMinOrange: 350,
  lsiMinGreen: 90, lsiMinOrange: 80,
}

describe('bepaalCriteriumStatus', () => {
  it('geeft null zonder bruikbare waarden', () => {
    expect(bepaalCriteriumStatus(geenDrempels, lsiSpec, {})).toBeNull()
    expect(bepaalCriteriumStatus(geenDrempels, lsiSpec, { leftPrimary: 400 })).toBeNull()
  })

  it('bilaterale drempels: MET als beide zijden en LSI groen halen', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 420, rightPrimary: 450 })
    expect(r?.status).toBe('MET') // LSI 93,3 >= 90, beide >= 400
    expect(r?.samenvatting).toContain('LSI')
  })

  it('bilaterale drempels: IN_PROGRESS als alleen oranje gehaald wordt', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 360, rightPrimary: 440 })
    expect(r?.status).toBe('IN_PROGRESS') // links onder 400, boven 350; LSI 81,8 >= 80
  })

  it('bilaterale drempels: NOT_MET onder oranje', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 300, rightPrimary: 450 })
    expect(r?.status).toBe('NOT_MET')
  })

  it('alleen LSI-drempels (geen newton): oordeelt op LSI alleen', () => {
    const alleenLsi: CriteriumDrempels = { ...geenDrempels, lsiMinGreen: 90, lsiMinOrange: 80 }
    const r = bepaalCriteriumStatus(alleenLsi, lsiSpec, { leftPrimary: 85, rightPrimary: 100 })
    expect(r?.status).toBe('IN_PROGRESS') // LSI 85
  })

  it('zonder eigen drempels: valt terug op de catalogus-zone', () => {
    const groen = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 12 })
    expect(groen?.status).toBe('MET')
    const oranje = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 9 })
    expect(oranje?.status).toBe('IN_PROGRESS')
    const rood = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 3 })
    expect(rood?.status).toBe('NOT_MET')
  })

  it('zoneOverride van de therapeut wint van de berekening', () => {
    const r = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 3, zoneOverride: 'GREEN' })
    expect(r?.status).toBe('MET')
  })

  it('samenvatting is leesbaar Nederlands met eenheid', () => {
    const r = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 12 })
    expect(r?.samenvatting).toBe('12 cm')
  })
})
```

- [ ] **Step 2: Run de tests, verwacht FAIL**

Run: `npx vitest run src/lib/__tests__/rehab-criterion-status.test.ts`
Expected: FAIL — module `../rehab-criterion-status` bestaat niet.

- [ ] **Step 3: Implementeer `src/lib/rehab-criterion-status.ts`**

```ts
/**
 * Statusberekening voor de koppeling criterium ↔ catalogus-test.
 *
 * Eén meting in een testrapport bepaalt de kleur van een gekoppeld
 * RehabCriterion. Volgorde van gezag:
 *   1. Eigen bilaterale drempels van het criterium (newtonMin* + lsiMin*).
 *   2. Alleen lsiMin*-drempels, op de LSI van links/rechts.
 *   3. De zones van de catalogus-test op de geplotte waarde.
 * Puur en framework-vrij, zodat vitest dit zonder database test.
 */
import {
  computeLsi,
  computePlottedValue,
  computeZone,
  formatNumber,
  formatPlotted,
  type TestSpec,
  type TestValues,
  type TestZone,
} from './test-report/compute'

export type RehabStatusWaarde = 'NOT_MET' | 'IN_PROGRESS' | 'MET'

export type CriteriumDrempels = {
  isBilateral: boolean
  newtonMinGreen: number | null
  newtonMinOrange: number | null
  lsiMinGreen: number | null
  lsiMinOrange: number | null
}

const ZONE_NAAR_STATUS: Record<TestZone, RehabStatusWaarde> = {
  GREEN: 'MET',
  ORANGE: 'IN_PROGRESS',
  RED: 'NOT_MET',
}

export function bepaalCriteriumStatus(
  drempels: CriteriumDrempels,
  spec: TestSpec,
  values: TestValues & { leftPrimary?: number | null; rightPrimary?: number | null },
): { status: RehabStatusWaarde; samenvatting: string } | null {
  const links = values.leftPrimary ?? null
  const rechts = values.rightPrimary ?? null
  const lsi = computeLsi(links, rechts)

  // Een handmatige zone-override in het rapport is een klinisch oordeel en
  // wint van elke berekening, ook van de criterium-drempels.
  if (values.zoneOverride) {
    return { status: ZONE_NAAR_STATUS[values.zoneOverride], samenvatting: samenvatting(spec, values, lsi) }
  }

  // 1. Bilaterale drempels: beide zijden halen de Newton-grens én de LSI-grens.
  if (drempels.isBilateral && drempels.newtonMinGreen != null && drempels.newtonMinOrange != null) {
    if (links == null || rechts == null || lsi == null) return null
    const lsiGroen = drempels.lsiMinGreen ?? 90
    const lsiOranje = drempels.lsiMinOrange ?? 80
    const minZijde = Math.min(links, rechts)
    let status: RehabStatusWaarde = 'NOT_MET'
    if (minZijde >= drempels.newtonMinGreen && lsi >= lsiGroen) status = 'MET'
    else if (minZijde >= drempels.newtonMinOrange && lsi >= lsiOranje) status = 'IN_PROGRESS'
    return { status, samenvatting: samenvatting(spec, values, lsi) }
  }

  // 2. Alleen LSI-drempels.
  if (drempels.lsiMinGreen != null && drempels.lsiMinOrange != null) {
    if (lsi == null) return null
    let status: RehabStatusWaarde = 'NOT_MET'
    if (lsi >= drempels.lsiMinGreen) status = 'MET'
    else if (lsi >= drempels.lsiMinOrange) status = 'IN_PROGRESS'
    return { status, samenvatting: samenvatting(spec, values, lsi) }
  }

  // 3. Catalogus-zones op de geplotte waarde.
  const zone = computeZone(spec, values)
  if (zone == null) return null
  return { status: ZONE_NAAR_STATUS[zone], samenvatting: samenvatting(spec, values, lsi) }
}

/** Leesbare meetwaarde voor RehabCriterionStatus.measurementValue. */
function samenvatting(
  spec: TestSpec,
  values: TestValues & { leftPrimary?: number | null; rightPrimary?: number | null },
  lsi: number | null,
): string {
  const links = values.leftPrimary ?? null
  const rechts = values.rightPrimary ?? null
  if (spec.kind === 'BILATERAL' && links != null && rechts != null) {
    const delen = [`L ${formatNumber(links)}`, `R ${formatNumber(rechts)}`]
    if (lsi != null) delen.push(`LSI ${Math.round(lsi)}%`)
    return delen.join(' · ')
  }
  return formatPlotted(spec, computePlottedValue(spec, values))
}
```

- [ ] **Step 4: Run de tests, verwacht PASS**

Run: `npx vitest run src/lib/__tests__/rehab-criterion-status.test.ts`
Expected: alle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rehab-criterion-status.ts src/lib/__tests__/rehab-criterion-status.test.ts
git commit -m "feat(rehab): pure statusberekening criterium op basis van een rapport-meting"
```

---

### Task 3: Server-doorwerking vanuit updateEntry

**Files:**
- Create: `src/server/lib/rehab-criterion-sync.ts`
- Modify: `src/server/routers/testReports.ts` (`updateEntry`, regel ~429)
- Modify: `src/server/routers/rehab.ts` (`updateCriterionStatus`, regel ~649: MET-melding hergebruiken)

**Interfaces:**
- Consumes: `bepaalCriteriumStatus` (Task 2), `findOpenTracker` uit `@/lib/rehab-data`, `notifyRehabCriterion`/`notifyRehabPhase` uit `@/server/push/notify`, kolommen uit Task 1.
- Produces: `syncCriteriaVoorEntry(prisma, entryId, therapistId): Promise<void>` en `meldMetOvergang(prisma, patientId, trackerId, criterion): Promise<void>`; `criterion` is `{ id: string; phaseId: string; phase: { protocolId: string; order: number } }`.

- [ ] **Step 1: Schrijf `src/server/lib/rehab-criterion-sync.ts`**

```ts
/**
 * Doorwerking van testrapport-metingen naar protocol-criteria.
 *
 * Aangeroepen na elke opslag van een rapport-entry (testReports.updateEntry).
 * Eén keer meten: het rapport toont de meting, en het gekoppelde criterium in
 * het lopende traject kleurt automatisch mee. Nieuwste meting wint; een oudere
 * meting overschrijft nooit een recentere status (ook geen handmatige).
 *
 * Bewust fire-and-forget vanuit de router (fouten falen de opslag niet): de
 * meting zelf is dan al opgeslagen en dat is de primaire handeling.
 */
import type { PrismaClient } from '@prisma/client'

import { findOpenTracker } from '@/lib/rehab-data'
import { bepaalCriteriumStatus } from '@/lib/rehab-criterion-status'
import type { TestSpec, TestValues } from '@/lib/test-report/compute'
import { notifyRehabCriterion, notifyRehabPhase } from '@/server/push/notify'

type CriterionRef = { id: string; phaseId: string; phase: { protocolId: string; order: number } }

/**
 * Melding aan de patiënt bij een echte overgang naar MET, plus de
 * fase-compleet-melding. Gedeeld met rehab.updateCriterionStatus zodat de
 * handmatige en de automatische route exact dezelfde meldingen sturen.
 * Telt op trackerId, nooit op patientId (vinkjes van oude trajecten tellen
 * anders mee).
 */
export async function meldMetOvergang(
  prisma: PrismaClient,
  patientId: string,
  trackerId: string,
  criterion: CriterionRef,
): Promise<void> {
  await notifyRehabCriterion(patientId).catch(() => {})
  const phaseCriteria = await prisma.rehabCriterion.findMany({
    where: { phaseId: criterion.phaseId },
    select: { id: true },
  })
  const metCount = await prisma.rehabCriterionStatus.count({
    where: {
      trackerId,
      criterionId: { in: phaseCriteria.map((c) => c.id) },
      status: 'MET',
    },
  })
  if (phaseCriteria.length > 0 && metCount === phaseCriteria.length) {
    const nextPhase = await prisma.rehabPhase.findFirst({
      where: { protocolId: criterion.phase.protocolId, order: { gt: criterion.phase.order } },
      select: { id: true },
    })
    if (nextPhase) await notifyRehabPhase(patientId).catch(() => {})
  }
}

export async function syncCriteriaVoorEntry(
  prisma: PrismaClient,
  entryId: string,
  therapistId: string,
): Promise<void> {
  const entry = await prisma.testReportEntry.findUnique({
    where: { id: entryId },
    include: { report: { select: { patientId: true, performedAt: true } } },
  })
  if (!entry || !entry.catalogItemId) return

  const tracker = await findOpenTracker(prisma, entry.report.patientId)
  if (!tracker) return

  const criteria = await prisma.rehabCriterion.findMany({
    where: { catalogItemId: entry.catalogItemId, phase: { protocolId: tracker.protocolId } },
    include: { phase: { select: { protocolId: true, order: true } } },
  })
  if (criteria.length === 0) return

  const spec: TestSpec = {
    kind: entry.kind as TestSpec['kind'],
    metric: entry.metric as TestSpec['metric'],
    plotUnit: entry.plotUnit,
    axisMin: entry.axisMin,
    axisMax: entry.axisMax,
    zoneOrangeMin: entry.zoneOrangeMin,
    zoneGreenMin: entry.zoneGreenMin,
    higherIsBetter: entry.higherIsBetter,
  }
  const values: TestValues & { leftPrimary?: number | null; rightPrimary?: number | null } = {
    leftPrimary: entry.leftPrimary,
    rightPrimary: entry.rightPrimary,
    singleValue: entry.singleValue,
    plottedValueOverride: entry.plottedValueOverride,
    zoneOverride: entry.zoneOverride as TestValues['zoneOverride'],
  }

  for (const criterion of criteria) {
    const uitkomst = bepaalCriteriumStatus(criterion, spec, values)
    if (!uitkomst) continue

    // Nieuwste meting wint. measurementDate is bij handmatige statussen vaak
    // leeg; dan telt updatedAt, zodat een handmatige registratie van vandaag
    // niet door een rapport van vorige week wordt teruggedraaid.
    const bestaand = await prisma.rehabCriterionStatus.findUnique({
      where: { trackerId_criterionId: { trackerId: tracker.id, criterionId: criterion.id } },
      select: { status: true, measurementDate: true, updatedAt: true },
    })
    const bestaandeDatum = bestaand?.measurementDate ?? bestaand?.updatedAt ?? null
    if (bestaandeDatum && entry.report.performedAt < bestaandeDatum) continue

    await prisma.rehabCriterionStatus.upsert({
      where: { trackerId_criterionId: { trackerId: tracker.id, criterionId: criterion.id } },
      update: {
        status: uitkomst.status,
        measurementValue: uitkomst.samenvatting,
        measurementDate: entry.report.performedAt,
        reportEntryId: entry.id,
        updatedById: therapistId,
      },
      create: {
        trackerId: tracker.id,
        criterionId: criterion.id,
        status: uitkomst.status,
        measurementValue: uitkomst.samenvatting,
        measurementDate: entry.report.performedAt,
        reportEntryId: entry.id,
        updatedById: therapistId,
      },
    })

    if (uitkomst.status === 'MET' && bestaand?.status !== 'MET') {
      await meldMetOvergang(prisma, entry.report.patientId, tracker.id, criterion)
    }
  }
}
```

Let op: de upsert kan tot migratie C botsen op de oude index `rehab_criterion_status_patientId_criterionId_key` (zie het commentaar in `rehab.ts` bij `updateCriterionStatus`). Omdat deze sync fire-and-forget draait, is een enkele mislukte upsert acceptabel; vang de fout per criterium af met `.catch(() => {})` rond de upsert als `npx tsc` of runtime-gedrag daartoe aanleiding geeft. Controleer eerst met een query op de database of die oude index nog bestaat; is hij weg, dan is dit punt vervallen.

- [ ] **Step 2: Hook in `testReports.updateEntry`**

In `src/server/routers/testReports.ts`, bovenaan importeren:

```ts
import { syncCriteriaVoorEntry } from '@/server/lib/rehab-criterion-sync'
```

In `updateEntry` (regel ~439), na de bestaande `await ctx.prisma.testReportEntry.update({ where: { id }, data })`:

```ts
      // Doorwerking naar het lopende revalidatietraject. Mag de opslag van de
      // meting zelf nooit laten falen.
      await syncCriteriaVoorEntry(ctx.prisma, id, ctx.user.id).catch(() => {})
```

- [ ] **Step 3: Hergebruik de meldingslogica in `updateCriterionStatus`**

In `src/server/routers/rehab.ts`: importeer `meldMetOvergang` uit `@/server/lib/rehab-criterion-sync` en vervang het blok `if (input.status === 'MET' && prevStatus?.status !== 'MET') { ... }` (regels ~729-758, inclusief de fase-compleet-telling) door:

```ts
      // Melding aan de patiënt bij de overgang naar MET. Faalt nooit de mutatie.
      if (input.status === 'MET' && prevStatus?.status !== 'MET') {
        await meldMetOvergang(ctx.prisma, input.patientId, tracker.id, {
          id: criterion.id,
          phaseId: criterion.phaseId,
          phase: { protocolId: criterion.phase.protocolId, order: criterion.phase.order },
        }).catch(() => {})
      }
```

De imports `notifyRehabCriterion`/`notifyRehabPhase` in `rehab.ts` mogen weg als niets anders in dat bestand ze meer gebruikt (controleer met een grep in het bestand).

- [ ] **Step 4: Typecheck en tests**

Run: `npx tsc --noEmit` → schoon.
Run: `npm test` → alle tests PASS (de bestaande suites plus Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/rehab-criterion-sync.ts src/server/routers/testReports.ts src/server/routers/rehab.ts
git commit -m "feat(rehab): meting in testrapport werkt gekoppeld criterium automatisch bij"
```

---

### Task 4: trackerId terug uit activateForPatient + baseline-rapport uit een traject

**Files:**
- Modify: `src/server/routers/rehab.ts` (`activateForPatient`, drie return-punten op regels ~252, ~288, ~345)
- Modify: `src/server/routers/testReports.ts` (`create`, regel ~310)

**Interfaces:**
- Consumes: `getRehabTrackerDataById` uit `@/lib/rehab-data` (bestaand), `specFromCatalog` (bestaand in testReports.ts).
- Produces: `rehab.activateForPatient` → `{ ok: true, trackerId: string }` (additief). `testReports.create` accepteert extra `fromTrackerId?: string` en retourneert zoals nu `{ id: string }`. Task 5 gebruikt beide.

- [ ] **Step 1: Laat activateForPatient de trackerId teruggeven**

In `rehab.ts`, de drie takken van `activateForPatient`:
- Tak 1 (nieuw traject, regel ~252): `return { ok: true }` → `return { ok: true, trackerId: gestart.id }`
- Tak 2 (zelfde protocol, regel ~288): `return { ok: true }` → `return { ok: true, trackerId: bestaand.id }`
- Tak 3 (protocolwissel, regel ~345): `return { ok: true }` → `return { ok: true, trackerId: nieuw.id }`

Additief veld; iOS-builds negeren onbekende velden.

- [ ] **Step 2: Breid testReports.create uit met fromTrackerId**

In `testReports.ts`, importeer bovenaan:

```ts
import { getRehabTrackerDataById } from '@/lib/rehab-data'
```

Vervang de `create`-procedure (regel ~310-332) door:

```ts
  create: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        performedAt: z.string().optional(),
        measurementNumber: z.number().int().nullable().optional(),
        subtitle: z.string().optional(),
        /// Traject-id: zet het rapport klaar als nulmeting van dat traject,
        /// met lege entries voor alle gekoppelde catalogus-testen van het
        /// protocol en een vooringevulde kop.
        fromTrackerId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)

      let kop: {
        measurementNumber: number | null
        trajectLabel?: string
        rehabPhaseLabel?: string | null
        injuryGoal?: string | null
      } = { measurementNumber: input.measurementNumber ?? null }
      let entryData: Array<ReturnType<typeof specFromCatalog> & { catalogItemId: string; order: number }> = []

      if (input.fromTrackerId) {
        const traject = await getRehabTrackerDataById(ctx.prisma, input.fromTrackerId)
        // Autoriseer op de patientId van de gevonden rij, nooit op de input.
        if (!traject || traject.patientId !== input.patientId || traject.deactivatedAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen lopend traject gevonden' })
        }
        const criteria = await ctx.prisma.rehabCriterion.findMany({
          where: { phase: { protocolId: traject.protocolId }, catalogItemId: { not: null } },
          orderBy: [{ phase: { order: 'asc' } }, { order: 'asc' }],
          select: { catalogItemId: true },
        })
        const catalogIds = [...new Set(criteria.map((c) => c.catalogItemId!))]
        const items = await ctx.prisma.testCatalogItem.findMany({
          where: { id: { in: catalogIds }, isActive: true },
        })
        const perId = new Map(items.map((i) => [i.id, i]))
        entryData = catalogIds
          .filter((cid) => perId.has(cid))
          .map((cid, i) => ({ catalogItemId: cid, order: i, ...specFromCatalog(perId.get(cid)!) }))

        const rapportTeller = await ctx.prisma.testReport.count({
          where: { patientId: input.patientId },
        })
        const fase =
          traject.expectedPhaseOrder != null
            ? traject.phases.find((p) => p.order === traject.expectedPhaseOrder)
            : null
        kop = {
          measurementNumber: input.measurementNumber ?? rapportTeller + 1,
          trajectLabel: traject.protocol.name,
          rehabPhaseLabel: fase
            ? `${fase.shortName}${traject.weeksSinceSurgery != null ? ` · week ${traject.weeksSinceSurgery} post-op` : ''}`
            : null,
          injuryGoal: traject.notes ?? null,
        }
      }

      const report = await ctx.prisma.testReport.create({
        data: {
          patientId: input.patientId,
          therapistId: ctx.user.id,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          subtitle:
            input.subtitle ?? 'Objectieve meting van kracht, power en mobiliteit',
          ...kop,
          ...(entryData.length > 0 ? { entries: { create: entryData } } : {}),
        },
      })
      return { id: report.id }
    }),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → schoon. (Let op het type van `entryData`: als de inline `ReturnType`-vorm wringt, definieer een lokaal type `EntrySeed = ReturnType<typeof specFromCatalog> & { catalogItemId: string; order: number }`.)

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/rehab.ts src/server/routers/testReports.ts
git commit -m "feat(testrapport): nulmeting klaarzetten vanuit een lopend traject"
```

---

### Task 5: Traject-dialoog — nulmeting-vinkje, succes-stap en autoOpen

**Files:**
- Modify: `src/components/rehab/RehabActivationToggle.tsx`
- Modify: `src/app/(therapist)/therapist/patients/[id]/page.tsx` (render op regel ~951, plus `useSearchParams`)

**Interfaces:**
- Consumes: `rehab.activateForPatient` → `{ ok, trackerId }` (Task 4), `testReports.create` met `fromTrackerId` (Task 4), `usePortal()` uit `@/lib/portal`.
- Produces: prop `autoOpenSetup?: boolean` op `RehabActivationToggle`.

- [ ] **Step 1: Breid RehabActivationToggle uit**

Wijzigingen in `RehabActivationToggle.tsx`:

1. Props: `export function RehabActivationToggle({ patientId, patientName, autoOpenSetup }: { patientId: string; patientName: string; autoOpenSetup?: boolean })`.
2. Imports aanvullen: `useEffect`, `useRef`, `useRouter` uit `next/navigation`, `usePortal` uit `@/lib/portal`, `DarkCheckbox` als die in `@/components/dark-ui` bestaat; zo niet, gebruik een gewone `<label>` met `<input type="checkbox">` in dezelfde stijl als elders in de codebase (grep op `type="checkbox"` voor het bestaande patroon).
3. Nieuwe state in de component:

```ts
  const router = useRouter()
  const portal = usePortal()
  const [nulmetingAan, setNulmetingAan] = useState(true)
  const [klaargezetRapportId, setKlaargezetRapportId] = useState<string | null>(null)
  const createReport = trpc.testReports.create.useMutation()
```

4. Auto-open, eenmalig zodra de data er is en er geen traject loopt:

```ts
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!autoOpenSetup || autoOpened.current) return
    if (tracker !== null) return // undefined = laden, object = loopt al
    autoOpened.current = true
    setSelectedProtocolId(protocols[0]?.id ?? '')
    setSurgeryDate('')
    setInjuryDate('')
    setSetupOpen(true)
  }, [autoOpenSetup, tracker, protocols])
```

5. In de setup-dialoog, onder het blessuredatum-veld, het vinkje:

```tsx
                <label className="flex items-center gap-2" style={{ color: P.ink, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={nulmetingAan}
                    onChange={(e) => setNulmetingAan(e.target.checked)}
                  />
                  Nulmeting klaarzetten (testrapport met de testen van dit protocol)
                </label>
```

6. De activeer-knop: na een geslaagde activatie het rapport klaarzetten en doorschakelen naar een succes-stap in dezelfde dialoog:

```ts
                    activate.mutate(
                      {
                        patientId,
                        protocolId: selectedProtocolId,
                        surgeryDate: surgeryDate || null,
                        injuryDate: injuryDate || null,
                      },
                      {
                        onSuccess: async (res) => {
                          if (nulmetingAan && res.trackerId) {
                            try {
                              const rapport = await createReport.mutateAsync({
                                patientId,
                                fromTrackerId: res.trackerId,
                              })
                              setKlaargezetRapportId(rapport.id)
                              return // dialoog blijft open voor de succes-stap
                            } catch {
                              toast.error('Traject gestart, maar de nulmeting kon niet worden klaargezet. Maak het rapport handmatig aan via Testrapporten.')
                            }
                          }
                          setSetupOpen(false)
                        },
                      },
                    )
```

7. Succes-stap: render in de `DarkDialogContent`, wanneer `klaargezetRapportId` gezet is, in plaats van het formulier:

```tsx
              {klaargezetRapportId ? (
                <div className="flex flex-col gap-4">
                  <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                    Het traject loopt en de nulmeting staat klaar. Je kunt de metingen nu
                    invoeren, of dat later doen via de kaart op deze pagina.
                  </p>
                  <div className="flex justify-end gap-2">
                    <DarkButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setKlaargezetRapportId(null)
                        setSetupOpen(false)
                      }}
                    >
                      Klaar
                    </DarkButton>
                    <DarkButton
                      variant="primary"
                      size="sm"
                      onClick={() => router.push(`${portal.base}/test-reports/${klaargezetRapportId}`)}
                    >
                      Naar nulmeting
                    </DarkButton>
                  </div>
                </div>
              ) : (
                <>{/* bestaand formulier */}</>
              )}
```

Let op: het coach-portaal heeft geen `/coach/test-reports`-route; `portal.base` is daar `/coach`. De toggle draait op therapeut-acties (`activateForPatient` is `therapistProcedure`), dus dit pad is voor coaches al onbereikbaar; geen extra werk.

- [ ] **Step 2: Auto-open vanaf de patiëntpagina**

In `src/app/(therapist)/therapist/patients/[id]/page.tsx`: haal de query-parameter op (de pagina is al een client-component; `useSearchParams` uit `next/navigation` toevoegen aan de bestaande imports):

```ts
  const searchParams = useSearchParams()
  const startTraject = searchParams.get('traject') === 'start'
```

En op regel ~951: `<RehabActivationToggle patientId={patient.id} patientName={patient.name} autoOpenSetup={startTraject} />`

- [ ] **Step 3: Typecheck + handmatige smoke**

Run: `npx tsc --noEmit` → schoon.

- [ ] **Step 4: Commit**

```bash
git add src/components/rehab/RehabActivationToggle.tsx "src/app/(therapist)/therapist/patients/[id]/page.tsx"
git commit -m "feat(rehab): traject-dialoog zet de nulmeting klaar en opent direct na aanmaken"
```

---

### Task 6: Patiëntenlijst — na de invite door naar de patiëntpagina

**Files:**
- Modify: `src/app/(therapist)/therapist/patients/page.tsx` (succes-paneel van de invite-dialoog, regels ~452-466)

**Interfaces:**
- Consumes: `portal.patients` uit `usePortal()` (al in gebruik op deze pagina), `inviteResult.patientUserId` (bestaand).

- [ ] **Step 1: Primaire knop wordt "traject starten"**

In het succes-paneel (regel ~452) de knoppenkolom vervangen door:

```tsx
                <div className="flex flex-col gap-2">
                  {inviteResult.patientUserId && (
                    <>
                      <DarkButton
                        variant="primary"
                        className="w-full"
                        onClick={() => {
                          const pid = inviteResult.patientUserId!
                          setInviteOpen(false)
                          resetInviteForm()
                          router.push(`${portal.patients}/${pid}?traject=start`)
                        }}
                      >
                        → Traject starten op de patiëntpagina
                      </DarkButton>
                      <DarkButton
                        variant="secondary"
                        className="w-full"
                        onClick={() => {
                          const pid = inviteResult.patientUserId!
                          setInviteOpen(false)
                          resetInviteForm()
                          router.push(`${portal.base}/programs/new?patientId=${pid}`)
                        }}
                      >
                        Maak een programma voor deze patiënt
                      </DarkButton>
                    </>
                  )}
                  <DarkButton
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setInviteOpen(false)
                      resetInviteForm()
                    }}
                  >
                    Sluiten
                  </DarkButton>
                </div>
```

Het paneel met de kopieerbare invite-URL erboven blijft ongewijzigd staan; de therapeut moet die link kunnen delen voordat hij doorklikt.

- [ ] **Step 2: Typecheck en commit**

Run: `npx tsc --noEmit` → schoon.

```bash
git add "src/app/(therapist)/therapist/patients/page.tsx"
git commit -m "feat(patiënten): invite-dialoog stuurt door naar traject starten"
```

---

### Task 7: Checklist-kaart op de patiëntpagina

**Files:**
- Modify: `src/server/routers/patients.ts` (`get`, return-blok rond regel ~556: veld toevoegen)
- Modify: `src/server/routers/testReports.ts` (`listForPatient`, regel ~269)
- Create: `src/components/rehab/TrajectChecklist.tsx`
- Modify: `src/app/(therapist)/therapist/patients/[id]/page.tsx` (render boven het revalidatie-blok, regel ~951)

**Interfaces:**
- Consumes: `patients.get` (heet zo in de web-UI; de procedure met `.input(z.object({ id: z.string() }))` op regel ~451 van patients.ts), `rehab.getPatientTracker`, `testReports.listForPatient`, `invite.resend` (bestaat al op de pagina), `testReports.create` met `fromTrackerId`.
- Produces: `patients.get` retourneert extra `dpaAcceptedAt: Date | null`; `testReports.listForPatient`-rijen krijgen extra `filledEntryCount: number`; component `TrajectChecklist`.

- [ ] **Step 1: dpaAcceptedAt in patients.get**

In het return-object van de get-procedure (regel ~556, naast `dateOfBirth`/`createdAt`):

```ts
        // Voor de traject-checklist: gezet zodra de patiënt de app geactiveerd
        // en de verwerkersvoorwaarden geaccepteerd heeft. Dit is de betrouwbare
        // "uitnodiging geaccepteerd"-marker; de invite-placeholder-note is
        // wisbaar en per relatie.
        dpaAcceptedAt: p.dpaAcceptedAt,
```

- [ ] **Step 2: filledEntryCount in listForPatient**

Vervang de body van `listForPatient` (regel ~269-291) door:

```ts
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const rows = await ctx.prisma.testReport.findMany({
        where: { patientId: input.patientId },
        orderBy: { performedAt: 'desc' },
        include: {
          therapist: { select: { name: true, email: true } },
          _count: { select: { entries: true } },
        },
      })
      // Per rapport het aantal entries met een echt ingevulde waarde. Aparte
      // groupBy omdat _count maar één telling per relatie kan geven.
      const gevuld = await ctx.prisma.testReportEntry.groupBy({
        by: ['reportId'],
        where: {
          report: { patientId: input.patientId },
          OR: [
            { leftPrimary: { not: null } },
            { rightPrimary: { not: null } },
            { singleValue: { not: null } },
            { textValue: { not: null } },
          ],
        },
        _count: { _all: true },
      })
      const gevuldPerRapport = new Map(gevuld.map((g) => [g.reportId, g._count._all]))
      return rows.map((r) => ({
        id: r.id,
        performedAt: r.performedAt,
        measurementNumber: r.measurementNumber,
        status: r.status,
        injuryGoal: r.injuryGoal,
        rehabPhaseLabel: r.rehabPhaseLabel,
        therapistName: r.therapist.name ?? r.therapist.email,
        entryCount: r._count.entries,
        filledEntryCount: gevuldPerRapport.get(r.id) ?? 0,
      }))
    }),
```

- [ ] **Step 3: Component TrajectChecklist**

`src/components/rehab/TrajectChecklist.tsx`:

```tsx
'use client'

/**
 * Traject-checklist op de patiëntpagina: wat staat er nog open voordat het
 * revalidatietraject echt loopt. Alleen zichtbaar zolang er een lopend traject
 * is én er iets openstaat; daarna verdwijnt de kaart vanzelf.
 */
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, MetaLabel, P, Tile } from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'
import { toast } from 'sonner'

function Regel({ af, children, actie }: { af: boolean; children: React.ReactNode; actie?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p style={{ color: af ? P.inkMuted : P.ink, fontSize: 13 }}>
        <span style={{ color: af ? P.lime : P.inkDim, marginRight: 8 }}>{af ? '✓' : '○'}</span>
        {children}
      </p>
      {!af && actie}
    </div>
  )
}

export function TrajectChecklist({
  patientId,
  dpaAcceptedAt,
  onResendInvite,
  resendPending,
}: {
  patientId: string
  dpaAcceptedAt: Date | string | null
  onResendInvite: () => void
  resendPending: boolean
}) {
  const router = useRouter()
  const portal = usePortal()
  const { data: tracker } = trpc.rehab.getPatientTracker.useQuery({ patientId })
  const { data: rapporten = [] } = trpc.testReports.listForPatient.useQuery({ patientId })
  const createReport = trpc.testReports.create.useMutation({
    onSuccess: (r) => router.push(`${portal.base}/test-reports/${r.id}`),
    onError: (e) => toast.error(e.message),
  })

  if (!tracker) return null

  const uitnodigingOk = dpaAcceptedAt != null
  const sindsStart = rapporten.filter(
    (r) => new Date(r.performedAt) >= new Date(tracker.activatedAt),
  )
  const nulmetingOk = sindsStart.some((r) => r.filledEntryCount > 0)
  if (uitnodigingOk && nulmetingOk) return null

  // Het klaargezette maar nog lege rapport, als dat er is (oudste eerst zodat
  // de knop naar de nulmeting wijst, niet naar een latere hermeting).
  const leegRapport = [...sindsStart].reverse().find((r) => r.filledEntryCount === 0)

  return (
    <Tile accentBar={P.brand}>
      <MetaLabel>Traject-start</MetaLabel>
      <div className="flex flex-col gap-2 mt-3">
        <Regel af>Traject actief · {tracker.protocol.name}</Regel>
        <Regel
          af={uitnodigingOk}
          actie={
            <DarkButton variant="ghost" size="sm" disabled={resendPending} onClick={onResendInvite}>
              Uitnodiging opnieuw versturen
            </DarkButton>
          }
        >
          {uitnodigingOk ? 'Uitnodiging geaccepteerd' : 'Uitnodiging nog niet geaccepteerd'}
        </Regel>
        <Regel
          af={nulmetingOk}
          actie={
            <DarkButton
              variant="ghost"
              size="sm"
              disabled={createReport.isPending}
              onClick={() => {
                if (leegRapport) router.push(`${portal.base}/test-reports/${leegRapport.id}`)
                else createReport.mutate({ patientId, fromTrackerId: tracker.trackerId })
              }}
            >
              Nulmeting invullen
            </DarkButton>
          }
        >
          {nulmetingOk ? 'Nulmeting ingevuld' : 'Nulmeting nog niet ingevuld'}
        </Regel>
      </div>
    </Tile>
  )
}
```

- [ ] **Step 4: Renderen op de patiëntpagina**

In `src/app/(therapist)/therapist/patients/[id]/page.tsx`, direct boven `<RehabActivationToggle ...>` (regel ~951):

```tsx
              <TrajectChecklist
                patientId={patient.id}
                dpaAcceptedAt={patient.dpaAcceptedAt}
                onResendInvite={() => resendInvite.mutate({ patientId: patient.id })}
                resendPending={resendInvite.isPending}
              />
```

Import toevoegen: `import { TrajectChecklist } from '@/components/rehab/TrajectChecklist'`.

Let op: `resendInvite` bestaat al op deze pagina (regel ~171) inclusief succes-afhandeling; hergebruik die mutatie, maak geen tweede.

- [ ] **Step 5: Typecheck en commit**

Run: `npx tsc --noEmit` → schoon.

```bash
git add src/components/rehab/TrajectChecklist.tsx src/server/routers/patients.ts src/server/routers/testReports.ts "src/app/(therapist)/therapist/patients/[id]/page.tsx"
git commit -m "feat(rehab): traject-checklist op de patiëntpagina"
```

---

### Task 8: Admin-koppel-UI + servervalidatie

**Files:**
- Modify: `src/server/routers/rehab.ts` (`adminUpdateCriterion` ~L877, `adminCreateCriterion` ~L901, en `adminGetProtocol` ~L791 zodat de UI de huidige koppeling ziet)
- Modify: `src/app/(admin)/admin/rehab-protocols/[id]/page.tsx` (`CriterionRow` ~L242, `AddCriterionButton` ~L425)

**Interfaces:**
- Consumes: `trpc.testReports.catalog` (bestaand; levert voor een admin zonder practice alleen globale items).
- Produces: `adminUpdateCriterion`/`adminCreateCriterion` accepteren `catalogItemId: string | null`; `adminGetProtocol`-criteria bevatten `catalogItemId` en `catalogItem: { name, subtitle } | null`.

- [ ] **Step 1: Servervalidatie — alleen globale, actieve testen**

In `rehab.ts`, een helper naast de bestaande helpers bovenin de router-file:

```ts
/**
 * Een criterium mag alleen naar een GLOBALE catalogus-test wijzen
 * (practiceId NULL): protocollen zijn globaal, en een koppeling naar een
 * praktijk-test zou voor andere praktijken naar iets onleesbaars verwijzen.
 */
async function assertGlobaleCatalogusTest(
  prisma: typeof import('@/lib/prisma').prisma,
  catalogItemId: string,
) {
  const item = await prisma.testCatalogItem.findFirst({
    where: { id: catalogItemId, practiceId: null, isActive: true },
    select: { id: true },
  })
  if (!item) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Alleen globale, actieve catalogus-testen kunnen aan een criterium gekoppeld worden',
    })
  }
}
```

In `adminUpdateCriterion`: input uitbreiden met `catalogItemId: z.string().nullable().optional()`, en in de mutation vóór de update:

```ts
      if (input.catalogItemId) await assertGlobaleCatalogusTest(ctx.prisma, input.catalogItemId)
```

In `adminCreateCriterion`: zelfde inputregel (`catalogItemId: z.string().nullable().optional()`) en dezelfde check vóór de create.

In `adminGetProtocol`: neem in de criteria-select `catalogItemId` en `catalogItem: { select: { name: true, subtitle: true } }` op (lees eerst de bestaande select-vorm op regel ~791 en vul aan in dezelfde stijl).

- [ ] **Step 2: Test-picker in het admin-scherm**

In `src/app/(admin)/admin/rehab-protocols/[id]/page.tsx`:

1. In de component die het edit-formulier van `CriterionRow` bevat (regel ~242-424): haal de catalogus op met `const { data: catalogus = [] } = trpc.testReports.catalog.useQuery()` en voeg onder het bestaande `inputType`-select-veld toe:

```tsx
              <div>
                <MetaLabel>Gekoppelde catalogus-test</MetaLabel>
                <DarkSelect value={catalogItemId ?? ''} onChange={(e) => setCatalogItemId(e.target.value || null)}>
                  <option value="">Geen koppeling (handmatig afvinken)</option>
                  {catalogus.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.subtitle ? ` · ${c.subtitle}` : ''}
                    </option>
                  ))}
                </DarkSelect>
              </div>
```

met bijbehorende state `const [catalogItemId, setCatalogItemId] = useState<string | null>(criterion.catalogItemId ?? null)`, geïnitialiseerd wanneer het formulier opent (volg hoe de andere velden dat doen), en `catalogItemId` meegestuurd in de bestaande `update.mutate({ ... })`.

2. In de leesweergave van `CriterionRow`: toon bij een gekoppeld criterium een klein label `→ {criterion.catalogItem.name}` in de bestaande metatekst-stijl (`athletic-mono`, `P.inkMuted`, fontSize 11).

3. In `AddCriterionButton` (regel ~425): zelfde select + state, `catalogItemId` meesturen in de create-mutatie.

- [ ] **Step 3: Typecheck en commit**

Run: `npx tsc --noEmit` → schoon.

```bash
git add src/server/routers/rehab.ts "src/app/(admin)/admin/rehab-protocols/[id]/page.tsx"
git commit -m "feat(admin): criteria koppelen aan catalogus-testen in het protocolbeheer"
```

---

### Task 9: Gecureerde seed — Melbourne-criteria koppelen

**Files:**
- Create: `scripts/link-melbourne-criteria.ts`

**Interfaces:**
- Consumes: kolom `RehabCriterion.catalogItemId` (Task 1); bestaande seeds `scripts/seed-rehab-melbourne-acl.ts` (criteria-namen) en `scripts/test-catalog-data.ts` (catalogus-keys).

- [ ] **Step 1: Schrijf het script**

```ts
/**
 * Koppelt de Melbourne VKB-criteria aan globale catalogus-testen.
 *
 * Gecureerde mapping, GEEN fuzzy matching: alleen paren waarvan doel en
 * meetmethode echt hetzelfde zijn. Combinatie-criteria (bv. "Kracht —
 * quadriceps & hamstrings", één criterium over twee testen) blijven bewust
 * ongekoppeld; splitsen is een inhoudelijke beslissing voor de praktijk.
 * ROM-criteria blijven ongekoppeld: hun fase-doelen (>120°, 135°, ...) wijken
 * af van de generieke zones op het catalogus-item.
 *
 * Idempotent. Draaien:
 *   npx tsx --env-file=.env.local scripts/link-melbourne-criteria.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// criterium-naam (exact zoals geseed) → catalogus-key. Geldt voor ALLE fases
// waarin een criterium met die naam voorkomt; hop-doelen zijn in elke fase
// LSI-gebaseerd en passen bij de catalogus-zones (oranje >= 80, groen >= 90).
const MAPPING: Record<string, string> = {
  'Single Hop Test': 'single-leg-hop',
  'Triple Hop Test': 'triple-hop',
  'Side Hop Test': 'side-hop',
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  const items = await prisma.testCatalogItem.findMany({
    where: { key: { in: Object.values(MAPPING) }, practiceId: null },
    select: { id: true, key: true, name: true },
  })
  const idPerKey = new Map(items.map((i) => [i.key!, i]))

  for (const [criteriumNaam, catalogKey] of Object.entries(MAPPING)) {
    const item = idPerKey.get(catalogKey)
    if (!item) {
      console.warn(`! catalogus-test '${catalogKey}' niet gevonden, overslaan`)
      continue
    }
    const res = await prisma.rehabCriterion.updateMany({
      where: {
        name: criteriumNaam,
        phase: { protocol: { key: 'melbourne-acl-2' } },
      },
      data: { catalogItemId: item.id },
    })
    console.log(`✓ '${criteriumNaam}' → ${item.name} (${res.count} criteria, alle fases)`)
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Controleer eerst hoe `scripts/seed-test-catalog.ts` zijn Prisma-client opbouwt (bovenin dat bestand, met dotenv/adapter) en volg exact hetzelfde patroon als dat afwijkt van bovenstaande.

- [ ] **Step 2: Draaien en verifiëren**

Run: `npx tsx --env-file=.env.local scripts/link-melbourne-criteria.ts`
Expected: drie `✓`-regels; 'Single Hop Test' meldt 2 criteria (pre-op + fase 3), de andere twee elk 1.

Verifieer daarna met een query (bv. `npx tsx --env-file=.env.local -e "..."` of een korte wegwerpquery in het script) dat `rehabCriterion.count({ where: { catalogItemId: { not: null } } })` = 4.

- [ ] **Step 3: Commit**

```bash
git add scripts/link-melbourne-criteria.ts
git commit -m "feat(rehab): seed koppelt Melbourne hop-testen aan de catalogus"
```

---

### Task 10: End-to-end-verificatie in de browser

**Files:** geen nieuwe; fixes die hieruit volgen horen bij deze task.

- [ ] **Step 1: Dev-server en volledige flow**

Start de dev-server via de browser-preview-tooling (`.claude/launch.json`; niet met kale Bash). Doorloop als therapeut:

1. Patiëntenlijst → invite aanmaken → succes-paneel toont de kopieerbare URL → knop "→ Traject starten op de patiëntpagina" → patiëntpagina opent mét traject-dialoog.
2. Dialoog: protocol Melbourne VKB, operatiedatum invullen, vinkje "Nulmeting klaarzetten" aan → bevestigen → succes-stap → "Naar nulmeting" opent het rapport met de gekoppelde testen (Single leg hop, Triple hop, Side hop) als lege entries en `Meting 01` + protocolnaam in de kop.
3. Vul bij Single leg hop links 130 en rechts 150 in (LSI ≈ 87) → open de patiëntpagina → RehabTracker: het criterium "Single Hop Test" staat op IN_PROGRESS met meetwaarde `L 130 · R 150 · LSI 87%` in zowel pre-op als fase 3.
4. Corrigeer rechts naar 140 (LSI ≈ 93) → criterium wordt MET.
4b. Nieuwste meting wint (acceptatiecriterium 3): maak een tweede rapport aan, zet `performedAt` op gisteren (kop-datumveld in het rapport), voeg Single leg hop toe en vul links 100, rechts 150 in (LSI ≈ 67) → de criterium-status blijft MET met de waarde van vandaag; het oudere rapport verandert er niets aan.
5. Checklist-kaart: toont "Uitnodiging nog niet geaccepteerd" (open) en "Nulmeting ingevuld" (af) → de kaart blijft staan; zet in de database `dpaAcceptedAt` op de testpatiënt (of accepteer als patiënt) → kaart verdwijnt.
6. Regressie: een criterium ZONDER koppeling handmatig afvinken op de tracker werkt zoals voorheen; een patiënt zonder traject toont geen checklist-kaart; `?traject=start` bij een patiënt met lopend traject opent NIET opnieuw de dialoog.
7. Bestaande patiënt: "Traject afsluiten" en daarna "Nieuw traject starten" → zelfde dialoog met nulmeting-vinkje.

Controleer daarbij de browser-console en de serverlogs op fouten.

- [ ] **Step 2: Volledige suite**

Run: `npm test` → PASS. Run: `npx tsc --noEmit` → schoon.

- [ ] **Step 3: Commit van eventuele fixes**

```bash
git add -A && git commit -m "fix(rehab): bevindingen uit de end-to-end-verificatie van de startflow"
```

(Alleen als er iets te fixen viel; anders overslaan.)

---

## Buiten dit plan

- Kinvent-sync (wacht op de koppeling aan Kinvent-zijde), plan/kalender in de flow, iOS-UI, coach-schrijfrechten. Zie sectie 9 van de spec.
- `npm run check:mirror` is niet nodig: geen gespiegelde bestanden geraakt.
