# Patiënt inactief zetten en rehab-trajecten als episodes: implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een therapeut kan een patiënt op inactief zetten en een revalidatietraject afsluiten, zodat een terugkerende patiënt een schoon nieuw traject krijgt terwijl het oude terug te lezen blijft.

**Architecture:** Twee losse stukken. Deel A bouwt `PatientRehabTracker` om van één-rij-per-patiënt naar echte episodes, met de criteriumstatussen aan het traject in plaats van aan de patiënt. Dat gaat in drie hand-SQL-fases volgens expand-en-contract, met een code-deploy ertussen. Deel B voegt een `PatientCareStatus`-tabel toe die per praktijk of per coach vastlegt dat een patiënt uitbehandeld is, en hangt daar filters, schrijf-guards en UI aan. Deel A is los shipbaar en gaat eerst.

**Tech Stack:** Next.js App Router, tRPC, Prisma 7 op Supabase Postgres, vitest, Expo/React Native (aparte repo `/Users/eva/mbt-gym-mobile`).

**Spec:** [2026-07-31-patient-inactief-en-rehab-trajecten-design.md](../specs/2026-07-31-patient-inactief-en-rehab-trajecten-design.md)
**Migratie-SQL:** [2026-07-31-rehab-episodes-migratie-sql.md](../specs/2026-07-31-rehab-episodes-migratie-sql.md)

## Global Constraints

- **Er is geen dev- of staging-database.** `prisma.config.ts` wijst naar `DIRECT_URL`. Elke `prisma db execute` en `db push` raakt live patiëntdata.
- **Draai nooit `npm run db:push` in deel A.** De diff bevat `ADD COLUMN "id" TEXT NOT NULL` op een gevulde tabel en `DROP COLUMN "patientId"` op `rehab_criterion_status`. Push lost dat op met `--accept-data-loss` en vernietigt 57 medische statusrijen. Hand-SQL eerst, `schema.prisma` daarna.
- **Migraties draaien met** `set -a; . ./.env.local; set +a; npx prisma db execute --file <pad>`.
- **RLS is verplicht op elke nieuwe public-tabel**, in dezelfde migratie: `ENABLE ROW LEVEL SECURITY` plus een `default_deny`-policy. `prisma db push` zet dat niet. Zie AGENTS.md.
- **De iOS-app heeft geen version-gate en geen OTA.** Build 78 staat in het veld. Elke serverwijziging raakt onmiddellijk alle geïnstalleerde builds, dus alles is additief: bestaande tRPC-inputs blijven werken, bestaande responsevormen wijzigen niet.
- **`rehab.getMyTracker` blijft één object of `null` teruggeven.** `app/rehab.tsx:87` doet `tracker.phases.map` zonder guard en er is geen ErrorBoundary. Een array is truthy en crasht de render.
- **De praktijk-tak van elke scope-check blijft gebonden aan `role === 'THERAPIST'`.** Coaches hebben `practiceId = null` en vallen daar bewust buiten. Zie AGENTS.md.
- **Nieuwe filters gaan onder `AND`, nooit als tweede `OR`-sleutel** naast de scope. De H1-lek van 27 juli staat gedocumenteerd op `src/server/routers/patients.ts:2099`.
- **Weekdatums rekenen in Europe/Amsterdam.** Gebruik `mondayKey` en `amsMidnight` uit `src/lib/week-dates.ts`, nooit `getUTCDay()` of een eigen `new Date(...)`.
- **Copy volgt `docs/tone-of-voice.md`:** Nederlands, geen em-dashes, geen holle marketingtaal.
- **Tests:** `npm test` draait vitest. De suite is nu 6 bestanden en 35 tests (`src/lib/__tests__/` en `src/server/wearables/__tests__/`), allemaal pure-functietests; er is geen harnas voor Prisma of tRPC. Nieuwe logica die getest moet worden, wordt daarom als pure functie in `src/lib/` gezet en daar getest. Databasegedrag wordt geverifieerd met de controlequery's in dit plan. Nul tests raken vandaag patiënt-scoping, toegang of rehab.
- **Typecheck na elke taak:** `npx tsc --noEmit` moet schoon zijn.

---

# Deel A: rehab-trajecten als episodes

## Uitvoervolgorde, herzien op 31 juli

De taaknummers hieronder zijn ongewijzigd, maar ze worden **niet op nummer
uitgevoerd**. Reden: migratie A vervangt de unieke sleutel op `patientId` door
een partiële index en voegt een `id`-kolom toe die NOT NULL is zonder default.
De op dat moment draaiende productiecode doet nog
`upsert({ where: { patientId } })`. Een partiële index dekt geen
`ON CONFLICT`-doel, en de oude Prisma-client schrijft de `id`-kolom niet mee.
Tussen migratie A en de code-deploy is "protocol aanzetten" dus stuk.

Door de code vóór de migratie te schrijven wordt dat venster minuten in plaats
van uren. `prisma generate` leest alleen `schema.prisma`, niet de database, dus
de code kan tegen het nieuwe model gebouwd worden terwijl de oude kolommen nog
in productie staan.

Fase C is bovendien **gesplitst in C1 en C2**, met een tweede deploy ertussen.
Reden: na een ongesplitste fase C draait er nog productiecode waarvan de
Prisma-client `patientId` op `RehabCriterionStatus` kent. Prisma zet bij een
`findMany` zonder `select` alle modelkolommen in de SELECT-lijst, dus
`src/lib/rehab-data.ts` vraagt dan een kolom op die niet meer bestaat. Dat
sloopt de complete gedeelde leeslaag: `rehab.getPatientTracker`,
`rehab.getMyTracker`, `rehab.getTraject`, de patiënt- en atleet-dashboards, de
rehab-pagina's, beide PDF-ingangen en iOS build 78. Schrijven valt ook om, want
de upsert vult `patientId` tot die deploy expliciet.

| Volgorde | Taak | Raakt productie |
| --- | --- | --- |
| 1 | Taak 1, backupscript | nee |
| 2 | Taak 4, schema naar de tussenfase | nee |
| 3 | Taak 5, leeslaag op het traject | nee |
| 4 | Taak 6, router op trajecten | nee |
| 5 | Taak 7, afsluiten, heropenen, historie | nee |
| 6 | Taak 10, test tegen kruisbesmetting | nee |
| 7 | Taak 1 stap 3, backup draaien | lezen |
| 8 | Taak 2, migratie A | ja, additief |
| 9 | Taak 3, migratie B | ja, additief |
| 10 | Taak 8, deploy 1, tussenfase-code, direct na de migratie | ja |
| 11 | Taak 9 deel 1, migratie C1 | ja, terug te draaien |
| 12 | Taak 9 deel 2, deploy 2, `patientId` uit schema en upsert | ja |
| 13 | Taak 9 deel 3, migratie C2 | ja, eenrichtingsdeur |

Kort samengevat is de volgorde dus: **migratie A, migratie B, deploy 1
(tussenfase-code), migratie C1, deploy 2 (schema opgeschoond), migratie C2.**

Er zijn **drie** vensters waarin oud en nieuw naast elkaar staan. Allemaal kort
houden: plan stap 8 tot en met 13 achter elkaar in één sessie, niet verspreid
over dagen.

**Venster 1, tussen migratie A/B en deploy 1.** De oude code draait op het
nieuwe schema. Twee gevolgen: `activateForPatient` kan geen nieuw traject meer
aanmaken (de oude client schrijft de `id`-kolom niet mee en de partiële index is
geen geldig `ON CONFLICT`-doel), en migratie B zet `trackerId` op NOT NULL,
waardoor de oude code ook geen nieuwe criteriumstatus meer kan wegschrijven.
Bestaande statussen bijwerken blijft wel werken.

**Venster 2, tussen deploy 1 en migratie C1.** De nieuwe code schrijft
`patientId` nog mee (dat moet, de kolom is NOT NULL), terwijl de oude unieke
index `rehab_criterion_status_patientId_criterionId_key` nog bestaat. Sluit een
therapeut in dat venster een traject af en start hij **hetzelfde** protocol
opnieuw, dan krijgt het eerste criterium dat hij aanvinkt een `23505`: de upsert
zoekt op `trackerId_criterionId`, vindt niets, doet een insert, en die botst op
de oude index. Een protocolwissel is wel veilig, want dat zijn andere criteria.

Migratie C1 dropt die index, dus dit venster sluit zodra C1 draait. Moet C1 om
wat voor reden ook wachten, drop dan direct na deploy 1 alleen deze regel:

```sql
DROP INDEX IF EXISTS public."rehab_criterion_status_patientId_criterionId_key";
```

Dat mag niet eerder: tot aan deploy 1 leunt de oude code op precies die index
voor zijn upsert.

**Venster 3, tussen migratie C1 en deploy 2.** Hier gebeurt niets spannends, en
dat is precies het punt van de splitsing. C1 haalt alleen de NOT NULL van
`patientId` af; de kolom staat er nog, dus de dan draaiende code kan gewoon
blijven lezen en schrijven. Deploy 2 haalt `patientId` uit
`prisma/schema.prisma` en uit de `create` in de upsert. Pas als die deploy live
staat mag C2 de kolom droppen.

## Task 1: Backup van de rehab-tabellen

**Files:**
- Create: `scripts/backup-rehab-tables.ts`
- Output: `scripts/backups/rehab-tables-<datum>.json`
- Output: `scripts/backups/rehab-criterion-status-orphans-<datum>.json`

**Interfaces:**
- Produces: een JSON-bestand met alle rijen uit de vijf rehab-tabellen, waar taak 3 en 4 op terugvallen als de migratie misgaat, plus een apart bestand met de wees-statusrijen die taak 3 verwijdert.

- [ ] **Step 1: Schrijf het backupscript**

Volg het huispatroon van `scripts/merge-duplicate-weeks.ts`: dry-run als default, `--apply` als vlag. Zie `scripts/backup-rehab-tables.ts` voor de uitgeschreven versie.

Twee dingen die niet vanzelf spreken, en die allebei in de kop van het script staan:

1. **Geen `prisma.<model>.findMany()`, maar rauwe SQL.** Dit script draait vóór migratie A, dus tegen het OUDE schema, terwijl de Prisma-client al op het NIEUWE schema is gegenereerd. Die zet `id`, `closedById`, `outcomeNote` en `trackerId` in zijn SELECT-lijst; die kolommen bestaan dan nog niet, dus elke modelaanroep valt om met 42703 en er komt geen backup. Een backup hoort het schema van de bron te volgen. `to_jsonb(t.*)` laat Postgres serialiseren, wat meteen de deserialisatie van enum- en `char`-kolommen omzeilt waar een kale `SELECT *` op struikelt.
2. **Het script schrijft ook het wees-bestand.** Migratie B eist een apart bestand met de statusrijen die geen tracker hebben, vóór de DELETE. Dat hoort niet in een los wegwerpscript dat iemand kan overslaan.

- [ ] **Step 2: Draai de dry-run**

Run: `npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts`
Expected: `Dry-run. Zou wegschrijven: protocols: N, phases: N, criteria: N, trackers: 2, statuses: 57, wees-statussen: 2`

- [ ] **Step 3: Draai de echte backup**

Run: `npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts --apply`
Expected: `scripts/backups/rehab-tables-2026-07-31.json` bestaat met 2 trackers, en `scripts/backups/rehab-criterion-status-orphans-2026-07-31.json` bestaat met 2 rijen.

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-rehab-tables.ts scripts/backups/
git commit -m "chore(rehab): backupscript voor de rehab-tabellen vóór de episode-migratie"
```

## Task 2: Migratie A, tracker krijgt een eigen primary key

**Files:**
- Create: `supabase/migrations/20260801_rehab_episodes_a.sql`

**Interfaces:**
- Produces: kolom `patient_rehab_trackers.id` als primary key, kolommen `closedById`, `outcome`, `outcomeNote`, enum `RehabTrajectOutcome`, en de partial unique index `patient_rehab_trackers_one_open_per_patient`. Taak 3 backfilt daarop.

Deze migratie is additief. De draaiende productiecode blijft werken, want `patientId` blijft uniek via de partial index.

- [ ] **Step 1: Schrijf het migratiebestand**

Neem de volledige SQL over uit de sectie "Fase A" van [de migratiebijlage](../specs/2026-07-31-rehab-episodes-migratie-sql.md). Kopieer letterlijk, inclusief de commentaarregels; de statements A1 tot en met A10 staan daar in de juiste volgorde.

- [ ] **Step 2: Draai de migratie**

```bash
set -a; . ./.env.local; set +a
npx prisma db execute --file supabase/migrations/20260801_rehab_episodes_a.sql
```

Expected: `Script executed successfully.`

- [ ] **Step 3: Controleer, beide moeten 0 geven**

Schrijf `.check-tmp.ts` in de repo-root, draai het, verwijder het daarna:

```ts
import { prisma as p } from './src/lib/prisma'
async function main() {
  const a: any = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM public.patient_rehab_trackers WHERE "id" IS NULL`)
  const b: any = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM (SELECT "patientId" FROM public.patient_rehab_trackers
     WHERE "deactivatedAt" IS NULL GROUP BY 1 HAVING count(*) > 1) x`)
  console.log(`zonder id: ${a[0].n} (moet 0)`)
  console.log(`patiënten met twee open trajecten: ${b[0].n} (moet 0)`)
}
main().finally(() => p.$disconnect())
```

Run: `npx tsx --env-file=.env.local ./.check-tmp.ts && rm ./.check-tmp.ts`
Expected: beide 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260801_rehab_episodes_a.sql
git commit -m "feat(rehab): migratie A, tracker krijgt eigen id en afsluitvelden"
```

## Task 3: Migratie B, criteriumstatussen krijgen een trackerId

**Files:**
- Create: `supabase/migrations/20260801_rehab_episodes_b.sql`
- Create: `scripts/backups/rehab-criterion-status-orphans-<datum>.json`

**Interfaces:**
- Consumes: `patient_rehab_trackers.id` uit taak 2.
- Produces: kolom `rehab_criterion_status.trackerId`, NOT NULL, met FK `ON DELETE CASCADE` en unique index op `("trackerId","criterionId")`. Taak 5 schrijft daarop.

Draai dit **direct na taak 2**. De backfill werkt alleen zolang `rehab_criterion_status."patientId"` nog gelijk is aan de oude PK-waarde van de tracker.

- [ ] **Step 1: Exporteer de wees-rijen**

Er staan twee statusrijen van een hard verwijderde gebruiker (`c329f19b-…`), beide `NOT_MET` zonder meetwaarde. Ze worden in stap 3 verwijderd, dus eerst wegschrijven.

Dat doet het backupscript uit taak 1 al: het schrijft naast de volledige dump een apart bestand met precies deze rijen weg. Is taak 1 stap 3 al gedraaid, dan staat het bestand er en kun je door naar stap 2. Zo niet:

Run: `npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts --apply`
Expected: `Geschreven naar .../rehab-criterion-status-orphans-2026-08-01.json: 2 rijen`

- [ ] **Step 2: Controleer dat het bestand er staat**

Run: `ls -la scripts/backups/rehab-criterion-status-orphans-*.json`
Expected: één bestand, groter dan 0 bytes. **Ga niet verder als het ontbreekt**: stap 3 verwijdert die rijen definitief.

- [ ] **Step 3: Schrijf en draai het migratiebestand**

Neem de volledige SQL over uit de sectie "Fase B" van de migratiebijlage (statements B1 tot en met B8).

```bash
set -a; . ./.env.local; set +a
npx prisma db execute --file supabase/migrations/20260801_rehab_episodes_b.sql
```

Expected: `Script executed successfully.`

- [ ] **Step 4: Controleer de backfill**

```ts
const a: any = await p.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM public.rehab_criterion_status WHERE "trackerId" IS NULL`)
const b: any = await p.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM public.rehab_criterion_status`)
console.log(`zonder trackerId: ${a[0].n} (moet 0), totaal: ${b[0].n} (moet 55)`)
```

Expected: 0 zonder trackerId, 55 totaal (57 min de 2 verwijderde wezen).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260801_rehab_episodes_b.sql scripts/backups/
git commit -m "feat(rehab): migratie B, criteriumstatussen hangen aan het traject"
```

## Task 4: Prisma-schema naar de tussenfase

**Files:**
- Modify: `prisma/schema.prisma` (modellen `PatientRehabTracker` 1454-1471, `RehabCriterionStatus` 1474-1491, `User`-relaties 355-357)

**Interfaces:**
- Produces: `prisma.patientRehabTracker` met veld `id`, `prisma.rehabCriterionStatus` met **zowel** `patientId` als `trackerId`. Taak 5 tot en met 8 gebruiken die client.

**Let op:** in de tussenfase is `rehab_criterion_status.patientId` nog `NOT NULL` zonder default. Laat je dat veld nu al uit het model weg, dan faalt elke insert. Het gaat er pas in taak 9 uit.

- [ ] **Step 1: Werk het schema bij**

Neem het schemafragment uit sectie 5.2 van de spec over, met één afwijking voor de tussenfase: houd `patientId String` in `RehabCriterionStatus`, naast `trackerId`.

```prisma
model RehabCriterionStatus {
  id     String @id @default(cuid())
  /// TIJDELIJK. Blijft tot migratie C de kolom dropt (taak 9). De kolom is
  /// NOT NULL zonder default, dus elke create moet 'm meeschrijven.
  patientId String
  trackerId String
  tracker   PatientRehabTracker @relation(fields: [trackerId], references: [id], onDelete: Cascade)
  // ... overige velden ongewijzigd
  @@unique([trackerId, criterionId])
  @@index([trackerId])
  @@map("rehab_criterion_status")
}
```

Op `User`: vervang `rehabTracker PatientRehabTracker? @relation("RehabTrackerPatient")` door `rehabTrackers PatientRehabTracker[] @relation("RehabTrackerPatient")` en voeg `rehabTrackersClosed PatientRehabTracker[] @relation("RehabTrackerCloser")` toe. Grep bevestigt dat `rehabTracker` nergens in `src/` gebruikt wordt, dus de hernoeming is veilig.

- [ ] **Step 2: Genereer de client en typecheck**

```bash
npx prisma generate && npx tsc --noEmit
```

Expected: typefouten in `src/server/routers/rehab.ts` en `src/lib/rehab-data.ts` op de plekken die nog op `patientId` keyen. Dat is de bedoeling; taak 5 en 6 lossen ze op.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(rehab): schema naar episode-model, tussenfase met beide sleutels"
```

## Task 5: Leeslaag op het traject in plaats van de patiënt

**Files:**
- Modify: `src/lib/rehab-data.ts:23-25` (tracker-lookup) en `:43-47` (statussen)

**Interfaces:**
- Produces: `getPatientRehabTrackerData(prisma, patientId)` geeft ongewijzigd één object of `null`, met dezelfde velden als nu. Taak 12, de PDF-routes en de iOS-app leunen daarop.

Dit is de belangrijkste taak van deel A. Beide regels compileren in de tussenfase gewoon door en geven stil verkeerde klinische uitkomsten.

- [ ] **Step 1: Voeg orderBy toe aan de tracker-lookup**

Regel 23-25 doet nu `findFirst({ where: { patientId, deactivatedAt: null } })` zonder `orderBy`. Met meerdere trajecten is "het actieve traject" daarmee niet-deterministisch.

```ts
const tracker = await prisma.patientRehabTracker.findFirst({
  where: { patientId, deactivatedAt: null },
  // Met historie kan er meer dan één rij per patiënt zijn. De partial unique
  // index houdt het aantal open trajecten op één, maar vertrouw daar niet op:
  // een expliciete volgorde maakt dit deterministisch.
  orderBy: { activatedAt: 'desc' },
  include: { protocol: true },
})
```

- [ ] **Step 2: Haal de statussen op via het traject**

Regel 43-47 haalt statussen op met `{ patientId, criterionId: { in: criterionIds } }`. Dat levert de vinkjes van álle trajecten van die patiënt, en dat is precies de bug die deze feature moet oplossen.

```ts
const statuses = await prisma.rehabCriterionStatus.findMany({
  // Op trackerId, niet op patientId: anders lekken de vinkjes van een
  // afgesloten traject door in het nieuwe protocol.
  where: { trackerId: tracker.id },
})
```

`criterionId: { in: criterionIds }` mag weg: de unique index op `("trackerId","criterionId")` garandeert al dat er per traject hoogstens één rij per criterium is, en de criteria van het traject zijn die van het protocol.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: geen fouten meer in `rehab-data.ts`.

- [ ] **Step 4: Handmatige controle tegen productie**

```ts
import { getPatientRehabTrackerData } from './src/lib/rehab-data'
import { prisma as p } from './src/lib/prisma'
async function main() {
  const t: any = await p.$queryRawUnsafe(
    `SELECT "patientId" FROM public.patient_rehab_trackers LIMIT 1`)
  const data = await getPatientRehabTrackerData(p, t[0].patientId)
  const alle = data?.phases.flatMap((f: any) => f.criteria) ?? []
  console.log(`fases: ${data?.phases.length}, criteria: ${alle.length}`)
  console.log(`met status: ${alle.filter((c: any) => c.status !== 'NOT_MET').length}`)
}
main().finally(() => p.$disconnect())
```

Expected: hetzelfde aantal fases en criteria als vóór de wijziging, en de bestaande vinkjes staan er nog.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rehab-data.ts
git commit -m "fix(rehab): criteriumstatussen lezen per traject, niet per patiënt"
```

## Task 6: Rehab-router op trajecten

**Files:**
- Modify: `src/server/routers/rehab.ts` (`activateForPatient` 90-134, `deactivateForPatient` 136-153, `updateTrackerDetails` 155-186, `updateCriterionStatus` 188-291, `adminDeleteProtocol` 371-386)

**Interfaces:**
- Consumes: het Prisma-model uit taak 4.
- Produces: `openTrackerFor(prisma, patientId)` als lokale helper die het lopende traject teruggeeft of `NOT_FOUND` gooit. Taak 7 gebruikt 'm.

Alle tRPC-inputs blijven `patientId` accepteren; de iOS-app stuurt niets anders.

- [ ] **Step 1: Voeg de helper toe, boven de router**

```ts
/**
 * Het lopende traject van een patiënt. Sinds het episode-model kan een patiënt
 * meerdere trajecten hebben; `deactivatedAt IS NULL` wijst het lopende aan en
 * de partial unique index patient_rehab_trackers_one_open_per_patient houdt
 * dat er hoogstens één is.
 */
async function openTrackerFor(prisma: PrismaClient, patientId: string) {
  const tracker = await prisma.patientRehabTracker.findFirst({
    where: { patientId, deactivatedAt: null },
    orderBy: { activatedAt: 'desc' },
  })
  if (!tracker) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen lopend traject voor deze patiënt' })
  }
  return tracker
}
```

- [ ] **Step 2: Herschrijf `activateForPatient`**

De huidige upsert op `where: { patientId }` (regel 113-132) zet `deactivatedAt` op null en overschrijft `protocolId`, `activatedById`, `activatedAt`, `surgeryDate` en `injuryDate` zonder spoor. Na migratie A gooit die upsert bovendien een `23505` op de partial unique index zodra er een open traject is.

```ts
// Een nieuw traject starten mag alleen als er geen lopend traject is. Anders
// zou het oude stil worden overschreven; sluiten gaat via closeTraject.
const bestaand = await ctx.prisma.patientRehabTracker.findFirst({
  where: { patientId: input.patientId, deactivatedAt: null },
})
if (bestaand) {
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'Er loopt al een traject. Sluit dat eerst af voordat je een nieuw traject start.',
  })
}
return ctx.prisma.patientRehabTracker.create({
  data: {
    patientId: input.patientId,
    protocolId: input.protocolId,
    activatedById: ctx.user.id,
    surgeryDate: input.surgeryDate ?? null,
    injuryDate: input.injuryDate ?? null,
    // `notes` is in zod .optional() en niet nullable. Bij een create is dat
    // geen probleem meer: elk traject begint met zijn eigen notitie.
    notes: input.notes ?? null,
  },
})
```

- [ ] **Step 3: Zet `deactivateForPatient` en `updateTrackerDetails` op de helper**

Beide doen nu `findUnique`/`update` op `where: { patientId }` (regels 140-147 en 166-183). Zodra `patientId` geen unieke sleutel meer is, falen die calls voor iedereen.

```ts
// deactivateForPatient
const tracker = await openTrackerFor(ctx.prisma, input.patientId)
return ctx.prisma.patientRehabTracker.update({
  where: { id: tracker.id },
  data: { deactivatedAt: new Date(), closedById: ctx.user.id },
})
```

```ts
// updateTrackerDetails
const tracker = await openTrackerFor(ctx.prisma, input.patientId)
return ctx.prisma.patientRehabTracker.update({
  where: { id: tracker.id },
  data: { surgeryDate: input.surgeryDate, injuryDate: input.injuryDate, notes: input.notes },
})
```

- [ ] **Step 4: Zet `updateCriterionStatus` op het traject**

Drie plekken. De protocol-guard op regel 202-215 vergelijkt het protocol van het criterium met dat van de tracker; dat moet het traject worden, anders kun je een criterium van traject A in traject B wegschrijven. De upsert op regel 233-256 gaat naar de compound `trackerId_criterionId`. En de fase-compleet-telling op regel 264-274 gaat naar `trackerId`, anders tellen vinkjes uit een afgesloten traject mee en krijgt de patiënt bij een nieuw traject meteen een onterechte "fase behaald"-push.

```ts
await assertTreating(ctx.prisma, ctx.user, input.patientId)
const tracker = await openTrackerFor(ctx.prisma, input.patientId)

const criterion = await ctx.prisma.rehabCriterion.findUnique({
  where: { id: input.criterionId },
  include: { phase: true },
})
if (!criterion || criterion.phase.protocolId !== tracker.protocolId) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Criterium hoort niet bij dit traject' })
}

await ctx.prisma.rehabCriterionStatus.upsert({
  where: { trackerId_criterionId: { trackerId: tracker.id, criterionId: input.criterionId } },
  create: {
    trackerId: tracker.id,
    // TIJDELIJK meeschrijven tot migratie C de kolom dropt (taak 9).
    patientId: input.patientId,
    criterionId: input.criterionId,
    status: input.status,
    measurementValue: input.measurementValue ?? null,
    measurementDate: input.measurementDate ?? null,
    notes: input.notes ?? null,
    updatedById: ctx.user.id,
  },
  update: { /* ongewijzigd */ },
})

const behaald = await ctx.prisma.rehabCriterionStatus.count({
  where: { trackerId: tracker.id, criterionId: { in: faseCriterionIds }, status: 'MET' },
})
```

- [ ] **Step 5: Maak `adminDeleteProtocol` historie-bewust**

Regel 371-386 telt alle trackers, inclusief gesloten. Met historie wordt een protocol daarmee onverwijderbaar, en de foutmelding verwijst naar `deactivateForPatient`, wat dan iets anders betekent.

```ts
const lopend = await ctx.prisma.patientRehabTracker.count({
  where: { protocolId: input.id, deactivatedAt: null },
})
if (lopend > 0) {
  throw new TRPCError({
    code: 'CONFLICT',
    message: `Protocol wordt gebruikt door ${lopend} lopend(e) traject(en). Sluit die eerst af of zet isActive op false.`,
  })
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/rehab.ts
git commit -m "feat(rehab): router werkt op trajecten, nieuw traject vervangt de upsert"
```

## Task 7: Traject afsluiten, heropenen en teruglezen

**Files:**
- Modify: `src/server/routers/rehab.ts` (nieuwe procedures)
- Modify: `src/server/audit.ts` (`AuditEvent`-union, regel 14-53)

**Interfaces:**
- Consumes: `openTrackerFor` uit taak 6.
- Produces: `rehab.closeTraject({ patientId, outcome, outcomeNote? })`, `rehab.reopenTraject({ trackerId })`, `rehab.listTrajects({ patientId })` → `{ id, protocolName, activatedAt, deactivatedAt, outcome, outcomeNote, behaaldeCriteria, totaalCriteria }[]`, `rehab.getTraject({ trackerId })` → dezelfde vorm als `getPatientTracker`. Taak 15 en 22 gebruiken deze.

Alle vier op `therapistProcedure`. Een coach mag geen klinische schrijfactie doen; AGENTS.md zet die expliciet daar.

- [ ] **Step 1: Voeg de audit-events toe**

In de union in `src/server/audit.ts`:

```ts
| 'REHAB_TRAJECT_CLOSED'
| 'REHAB_TRAJECT_REOPENED'
```

- [ ] **Step 2: Schrijf `closeTraject`**

```ts
closeTraject: therapistProcedure
  .input(z.object({
    patientId: z.string(),
    outcome: z.enum(['COMPLETED', 'DISCONTINUED', 'TRANSFERRED', 'RELAPSE', 'UNKNOWN']),
    outcomeNote: z.string().max(2000).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    await assertTreating(ctx.prisma, ctx.user, input.patientId)
    const tracker = await openTrackerFor(ctx.prisma, input.patientId)
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
```

- [ ] **Step 3: Schrijf `reopenTraject`**

```ts
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

    const nieuwer = await ctx.prisma.patientRehabTracker.findFirst({
      where: { patientId: tracker.patientId, activatedAt: { gt: tracker.activatedAt } },
    })
    if (nieuwer) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Er is al een nieuwer traject gestart. Dit traject kan niet meer heropend worden.',
      })
    }
    const open = await ctx.prisma.patientRehabTracker.findFirst({
      where: { patientId: tracker.patientId, deactivatedAt: null },
    })
    if (open) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Er loopt al een traject voor deze patiënt.' })
    }
    const reopened = await ctx.prisma.patientRehabTracker.update({
      where: { id: tracker.id },
      data: { deactivatedAt: null, closedById: null, outcome: null, outcomeNote: null },
    })
    await auditLog({
      event: 'REHAB_TRAJECT_REOPENED',
      userId: ctx.user.id,
      actorEmail: ctx.user.email,
      resource: 'PatientRehabTracker',
      resourceId: tracker.id,
      metadata: { route: 'rehab.reopenTraject' },
      req: ctx.req,
    })
    return reopened
  }),
```

- [ ] **Step 4: Schrijf `listTrajects` en `getTraject`**

```ts
listTrajects: therapistProcedure
  .input(z.object({ patientId: z.string() }))
  .query(async ({ ctx, input }) => {
    await assertTreating(ctx.prisma, ctx.user, input.patientId)
    const trackers = await ctx.prisma.patientRehabTracker.findMany({
      where: { patientId: input.patientId },
      orderBy: { activatedAt: 'desc' },
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

getTraject: therapistProcedure
  .input(z.object({ trackerId: z.string() }))
  .query(async ({ ctx, input }) => {
    const tracker = await ctx.prisma.patientRehabTracker.findUnique({
      where: { id: input.trackerId },
      select: { id: true, patientId: true },
    })
    if (!tracker) throw new TRPCError({ code: 'NOT_FOUND' })
    await assertTreating(ctx.prisma, ctx.user, tracker.patientId)
    return getRehabTrackerDataById(ctx.prisma, tracker.id)
  }),
```

- [ ] **Step 5: Splits de leeslaag zodat `getTraject` hem kan hergebruiken**

In `src/lib/rehab-data.ts`: haal de body van `getPatientRehabTrackerData` uit elkaar in `getRehabTrackerDataById(prisma, trackerId)`, en laat de bestaande functie het open traject opzoeken en die aanroepen. De bestaande export en zijn returnvorm blijven ongewijzigd, want de PDF-routes en de iOS-app leunen erop.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/rehab.ts src/server/audit.ts src/lib/rehab-data.ts
git commit -m "feat(rehab): traject afsluiten, heropenen en historie teruglezen"
```

## Task 8: Deploy de tussenfase

**Files:** geen

Dit is een gate, geen codewijziging. Migratie C mag pas draaien als de code die op `trackerId` schrijft live staat, anders gooit de oude code op Vercel een Prisma-fout zodra de kolom weg is.

- [ ] **Step 1: Typecheck en build**

```bash
npx tsc --noEmit && npm run build
```

Expected: beide slagen.

- [ ] **Step 2: Deploy naar productie**

Push naar `main` en wacht tot de Vercel-deploy groen is.

- [ ] **Step 3: Rook-test tegen productie**

Open een patiënt met een lopend traject op `/therapist/patients/<id>`, vink een criterium aan en weer uit. Controleer dat de status blijft staan na een refresh.

- [ ] **Step 4: Controleer dat er op beide kolommen geschreven wordt**

```ts
const r: any = await p.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM public.rehab_criterion_status
   WHERE "trackerId" IS NULL OR "patientId" IS NULL`)
console.log(`rijen met een lege sleutel: ${r[0].n} (moet 0)`)
```

Expected: 0.

## Task 9: Migratie C1, deploy 2, migratie C2

**Files:**
- Create: `supabase/migrations/20260802_rehab_episodes_c1.sql`
- Create: `supabase/migrations/20260803_rehab_episodes_c2.sql`
- Modify: `prisma/schema.prisma` (haal `patientId` uit `RehabCriterionStatus`)
- Modify: `src/server/routers/rehab.ts` (haal het tijdelijke `patientId` uit de upsert-create)
- Modify: `scripts/check-migrations.ts` (regel 17-40, `checks`-array)

**Interfaces:**
- Produces: het definitieve datamodel. Vanaf C2 is terugdraaien lossy zodra er een tweede traject bestaat.

Deze taak bevat **een deploy in het midden**. C1 en C2 zijn twee bestanden en
mogen niet aan elkaar geplakt worden: tussen die twee moet de deploy staan die
`patientId` uit het Prisma-model haalt. Draai je de DROP COLUMN daarvóór, dan
vraagt de dan draaiende leeslaag een kolom op die niet meer bestaat en valt
elke rehab-lees- en schrijfactie om, ook op iOS build 78.

- [ ] **Step 1: Schrijf en draai migratie C1**

Neem de volledige SQL over uit de sectie "Fase C1" van de migratiebijlage. De volgorde is dwingend: eerst de vier policies droppen (ze bevatten `is_therapist_of("patientId")` en zijn een pg_depend-afhankelijkheid, dus de `DROP COLUMN` in C2 faalt zolang ze bestaan), dan de indexen, dan de NOT NULL van `patientId` af, dan RLS en grants.

```bash
set -a; . ./.env.local; set +a
npx prisma db execute --file supabase/migrations/20260802_rehab_episodes_c1.sql
```

Na C1 blijft de op dat moment draaiende code gewoon werken: de kolom bestaat nog.

- [ ] **Step 2: Haal `patientId` uit het Prisma-model en uit de upsert, en deploy**

In `prisma/schema.prisma`: verwijder het tijdelijke `patientId String` uit `RehabCriterionStatus`. In `src/server/routers/rehab.ts`: verwijder de regel `patientId: input.patientId` uit de `create` van de upsert.

Push naar `main` en wacht tot de Vercel-deploy groen is. **Dit is deploy 2.** Pas daarna mag stap 6 draaien.

Controle dat er niets is blijven staan, beide moeten leeg zijn:

```bash
sed -n '/model RehabCriterionStatus/,/^}/p' prisma/schema.prisma | grep patientId
grep -n "patientId: input.patientId" src/server/routers/rehab.ts
```

- [ ] **Step 3: Genereer en controleer dat de diff leeg is**

```bash
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: `-- This is an empty migration.` De baseline was vóór dit werk al leeg, dus elke afwijking is nieuw.

- [ ] **Step 4: Voeg de drie checks toe aan `check-migrations.ts`**

Volg het patroon op regel 17-40:

```ts
{
  name: 'patient_rehab_trackers.id kolom',
  migration: '20260801_rehab_episodes_a.sql',
  run: async () => {
    await prisma.$queryRawUnsafe(`SELECT "id" FROM public.patient_rehab_trackers LIMIT 1`)
    return true
  },
},
{
  name: 'rehab_criterion_status.trackerId kolom',
  migration: '20260801_rehab_episodes_b.sql',
  run: async () => {
    await prisma.$queryRawUnsafe(`SELECT "trackerId" FROM public.rehab_criterion_status LIMIT 1`)
    return true
  },
},
{
  name: 'rehab_criterion_status.patientId is weg',
  migration: '20260803_rehab_episodes_c2.sql',
  run: async () => {
    const r: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema='public' AND table_name='rehab_criterion_status' AND column_name='patientId'`)
    return r[0].n === 0
  },
},
```

Deze derde check gaat pas groen ná stap 6. Voeg hem nu al toe, dan is de rode check tot dat moment het bewijs dat C2 nog moet.

- [ ] **Step 5: Draai de typecheck**

```bash
npx tsc --noEmit
```

Expected: exit-code 0.

- [ ] **Step 6: Draai migratie C2, pas nadat deploy 2 live staat**

Eén statement, en het is de eenrichtingsdeur. Controleer eerst in de Vercel-deploy-log dat de build van stap 2 live is.

```bash
set -a; . ./.env.local; set +a
npx prisma db execute --file supabase/migrations/20260803_rehab_episodes_c2.sql
npx tsx --env-file=.env.local scripts/check-migrations.ts
```

Expected: `Script executed successfully.` en daarna alle checks groen, inclusief de derde.

- [ ] **Step 7: Commit**

De commit van de code hoort bij stap 2, dus vóór de deploy. Deze commit sluit de reeks af.

```bash
git add supabase/migrations/20260802_rehab_episodes_c1.sql supabase/migrations/20260803_rehab_episodes_c2.sql scripts/check-migrations.ts
git commit -m "feat(rehab): migratie C1 en C2, patientId van de statustabel af"
```

## Task 10: Test dat trajecten elkaar niet vervuilen

**Files:**
- Create: `src/lib/rehab-traject.ts`
- Create: `src/lib/__tests__/rehab-traject.test.ts`

**Interfaces:**
- Produces: `mergeCriterionStatuses(criteria, statuses)` → `{ ...criterion, status, measurementValue, measurementDate }[]`, gebruikt door `rehab-data.ts`.
- Produces: `statussenVanTraject(statuses, trackerId, criterionIds)` → dezelfde rijen, gefilterd op traject én protocol. Ook gebruikt door `rehab-data.ts`.

Er is geen testharnas voor Prisma, dus de regel wordt als pure functie getest.

Let op waar de bescherming zit. `mergeCriterionStatuses` kent geen trajecten en kan de kernbug per definitie niet zien: twee trajecten op **hetzelfde** protocol delen dezelfde criterionIds, dus een test met een onbekend criterium slaagt ook als de datalaag weer op `where: { patientId }` staat. Daarom filtert `statussenVanTraject` op `trackerId` en draait `rehab-data.ts` die functie over het queryresultaat heen. Die functie is wél te testen met het echte scenario, en is tegelijk een tweede slot als de where-clausule ooit terugvalt.

- [ ] **Step 1: Schrijf de falende test**

```ts
import { describe, expect, it } from 'vitest'
import { mergeCriterionStatuses } from '../rehab-traject'

const criteria = [
  { id: 'c1', name: 'Knieflexie' },
  { id: 'c2', name: 'Hop test' },
]

describe('mergeCriterionStatuses', () => {
  it('koppelt een status aan zijn criterium', () => {
    const uit = mergeCriterionStatuses(criteria, [
      { criterionId: 'c1', status: 'MET', measurementValue: '128°', measurementDate: null },
    ])
    expect(uit[0].status).toBe('MET')
    expect(uit[0].measurementValue).toBe('128°')
  })

  it('geeft NOT_MET voor een criterium zonder status', () => {
    const uit = mergeCriterionStatuses(criteria, [])
    expect(uit.map((c) => c.status)).toEqual(['NOT_MET', 'NOT_MET'])
  })

  it('negeert een status van een criterium buiten dit protocol', () => {
    const uit = mergeCriterionStatuses(criteria, [
      { criterionId: 'onbekend', status: 'MET', measurementValue: '99', measurementDate: null },
    ])
    expect(uit.every((c) => c.status === 'NOT_MET')).toBe(true)
  })
})

describe('statussenVanTraject', () => {
  // Dit is de regressie waar het om gaat: twee trajecten op hetzelfde protocol,
  // dus met exact dezelfde criterionIds. Alleen de trackerId onderscheidt ze.
  const status = (trackerId: string, criterionId: string) => ({
    trackerId,
    criterionId,
    status: 'MET',
  })

  it('laat de vinkjes van een afgesloten traject niet in het nieuwe traject vallen', () => {
    const alles = [status('traject-oud', 'c1'), status('traject-nieuw', 'c1')]
    expect(statussenVanTraject(alles, 'traject-nieuw', ['c1', 'c2'])).toEqual([
      status('traject-nieuw', 'c1'),
    ])
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npm test -- rehab-traject`
Expected: FAIL, `Cannot find module '../rehab-traject'`

- [ ] **Step 3: Schrijf de implementatie**

```ts
/** Eén criterium zoals het uit het protocol komt. */
export type CriterionLike = { id: string; [k: string]: unknown }
/** Eén vastgelegde status, altijd van één traject. */
export type StatusLike = {
  criterionId: string
  status: string
  measurementValue: string | null
  measurementDate: Date | null
}

/**
 * Voegt de vastgelegde statussen bij de criteria van een protocol. Criteria
 * zonder status krijgen NOT_MET; statussen die bij geen enkel criterium horen
 * worden genegeerd in plaats van toegevoegd.
 */
export function mergeCriterionStatuses<T extends CriterionLike>(
  criteria: T[],
  statuses: StatusLike[],
) {
  const perCriterium = new Map(statuses.map((s) => [s.criterionId, s]))
  return criteria.map((c) => {
    const s = perCriterium.get(c.id)
    return {
      ...c,
      status: s?.status ?? 'NOT_MET',
      measurementValue: s?.measurementValue ?? null,
      measurementDate: s?.measurementDate ?? null,
    }
  })
}
```

Plus `statussenVanTraject`, dat op `trackerId` én op de criteria van het protocol filtert. Zie `src/lib/rehab-traject.ts` voor de uitgeschreven versie.

- [ ] **Step 4: Draai de test**

Run: `npm test -- rehab-traject`
Expected: PASS.

- [ ] **Step 5: Gebruik de functies in `rehab-data.ts`**

Vervang de handmatige koppeling van statussen aan criteria door `mergeCriterionStatuses(criteria, statuses)`, en draai het queryresultaat eerst door `statussenVanTraject(ruweStatussen, tracker.id, criterionIds)`. De query zelf begrenst ook op `criterionId: { in: criterionIds }`: zonder die grens kunnen `met` en `inProgress` op topniveau hoger uitvallen dan `total`.

- [ ] **Step 6: Typecheck en volledige testsuite**

```bash
npx tsc --noEmit && npm test
```

Expected: schoon, alle tests groen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rehab-traject.ts src/lib/__tests__/rehab-traject.test.ts src/lib/rehab-data.ts
git commit -m "test(rehab): statussen van een ander traject lekken niet in de criteria"
```

---

# Deel B: patiënt inactief zetten

Deel A moet live staan voordat deel B begint: taak 15 sluit een lopend traject af via `rehab.closeTraject`.

## Task 11: PatientCareStatus in het schema en de database

**Files:**
- Modify: `prisma/schema.prisma` (nieuw model, nieuwe enum, `User`- en `Practice`-relaties)
- Create: `supabase/migrations/20260803_patient_care_status.sql`

**Interfaces:**
- Produces: `prisma.patientCareStatus` met velden `id`, `patientId`, `practiceId`, `coachId`, `dischargedAt`, `dischargedById`, `reason`, `note`. Taak 12 tot en met 18 gebruiken dit.

- [ ] **Step 1: Voeg model en enum toe aan het schema**

Neem het fragment uit sectie 5.1 van de spec letterlijk over, inclusief de commentaarregels. Voeg op `User` toe: `careStatuses PatientCareStatus[] @relation("CareStatusPatient")`, `careStatusesAsCoach PatientCareStatus[] @relation("CareStatusCoach")` en `careStatusesDischarged PatientCareStatus[] @relation("CareStatusDischarger")`. Op `Practice`: `careStatuses PatientCareStatus[]`.

Voeg ook de kolom op `Program` toe die bij taak 16 hoort:

```prisma
/// Gezet toen dit programma automatisch werd afgesloten omdat de patiënt op
/// inactief ging. Alleen die programma's worden bij heractiveren teruggezet;
/// programma's die de therapeut zelf afrondde blijven COMPLETED.
closedByDischarge Boolean @default(false)
```

- [ ] **Step 2: Push het schema**

Deze wijziging is puur additief: een nieuwe tabel en een nieuwe kolom met een default. `db push` is hier veilig, anders dan in deel A.

```bash
set -a; . ./.env.local; set +a
npx prisma db push
```

Expected: geen `--accept-data-loss`-prompt. **Breek af als hij er wel om vraagt** en zoek uit waarom.

- [ ] **Step 3: Schrijf en draai de RLS-migratie**

`prisma db push` zet geen RLS. Zonder deze migratie is de tabel rechtstreeks leesbaar via de Supabase REST-API.

```sql
-- RLS + partial unique indexen op patient_care_status (2026-08-03).
--
-- De tabel legt per praktijk (therapeut) of per coach vast dat een patiënt
-- uitbehandeld is. Prisma draait als tabel-eigenaar met BYPASSRLS, dus
-- deny-all volstaat; zie AGENTS.md.

ALTER TABLE public.patient_care_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.patient_care_status;
CREATE POLICY "default_deny" ON public.patient_care_status
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.patient_care_status FROM anon, authenticated;

-- Postgres ziet NULLs als verschillend, dus een gewone @@unique([patientId,
-- practiceId]) laat dubbele rijen toe zodra practiceId leeg is. Prisma kan
-- partial indexen niet uitdrukken en negeert ze bij db push; precedent is
-- users_one_owner_per_practice in 20260510_practice_profile.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_practice"
  ON public.patient_care_status ("patientId", "practiceId") WHERE "practiceId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_coach"
  ON public.patient_care_status ("patientId", "coachId") WHERE "coachId" IS NOT NULL;
```

```bash
npx prisma db execute --file supabase/migrations/20260803_patient_care_status.sql
```

- [ ] **Step 4: Controleer RLS en de diff**

```ts
const r: any = await p.$queryRawUnsafe(`
  SELECT c.relrowsecurity::text AS rls,
         (SELECT count(*)::int FROM pg_policies WHERE tablename='patient_care_status') AS policies,
         (SELECT count(*)::int FROM information_schema.role_table_grants
          WHERE table_name='patient_care_status' AND grantee IN ('anon','authenticated')
            AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) AS schrijfrechten
  FROM pg_class c WHERE c.relname='patient_care_status'`)
console.log(r[0])
```

Expected: `rls: 'true'`, `policies: 1`, `schrijfrechten: 0`.

Run daarna: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: `-- This is an empty migration.`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma supabase/migrations/20260803_patient_care_status.sql
git commit -m "feat(patients): PatientCareStatus-tabel met RLS en scope-indexen"
```

## Task 12: De scope-helper, met test

**Files:**
- Create: `src/lib/care-scope.ts`
- Create: `src/lib/__tests__/care-scope.test.ts`

**Interfaces:**
- Produces: `careScopeKey(user)` → `{ practiceId: string } | { coachId: string }` en `careScopeWhere(user)` → een Prisma-`where`-fragment voor `PatientCareStatus`. Taak 13 tot en met 18 gebruiken beide.

Dit is de plek waar `practiceId = null` twee dingen betekent: een coach én een therapeut zonder praktijk. `planScope` in `src/server/lib/plan-access.ts:14-16` is het enige bestaande patroon dat dat correct oplost; dit is de rehab-variant ervan.

- [ ] **Step 1: Schrijf de falende test**

```ts
import { describe, expect, it } from 'vitest'
import { careScopeKey, careScopeWhere } from '../care-scope'

const therapeut = { id: 't1', role: 'THERAPIST' as const, practiceId: 'p1' }
const coach = { id: 'c1', role: 'COACH' as const, practiceId: null }
const losseTherapeut = { id: 't2', role: 'THERAPIST' as const, practiceId: null }

describe('careScopeKey', () => {
  it('scopet een therapeut op zijn praktijk', () => {
    expect(careScopeKey(therapeut)).toEqual({ practiceId: 'p1', coachId: null })
  })

  it('scopet een coach op zichzelf, niet op practiceId null', () => {
    // Een coach heeft altijd practiceId null. Zonder eigen sleutel zouden
    // twee coaches elkaars gearchiveerde atleten zien.
    expect(careScopeKey(coach)).toEqual({ practiceId: null, coachId: 'c1' })
  })

  it('weigert een therapeut zonder praktijk', () => {
    expect(() => careScopeKey(losseTherapeut)).toThrow(/praktijk/i)
  })
})

describe('careScopeWhere', () => {
  it('geeft nooit een lege where terug', () => {
    // Een lege where zou in een OR-tak de scoping volledig laten wegvallen.
    expect(careScopeWhere(coach)).toEqual({ coachId: 'c1' })
    expect(careScopeWhere(therapeut)).toEqual({ practiceId: 'p1' })
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npm test -- care-scope`
Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Schrijf de implementatie**

```ts
/**
 * Scope-sleutel voor PatientCareStatus. Een uitbehandel-markering geldt binnen
 * één praktijk of bij één coach, nooit globaal: dezelfde persoon kan tegelijk
 * coach-atleet en praktijk-patiënt zijn (patients.inviteCoMonitor maakt die
 * combinatie), en de coach-rol staat bewust buiten de praktijk (AGENTS.md).
 *
 * Bind de praktijk-tak expliciet aan de rol, niet aan een gevulde practiceId:
 * patiënten en atleten krijgen bij een invite dezelfde practiceId als hun
 * therapeut.
 */
type ScopeUser = { id: string; role: string; practiceId: string | null }

export function careScopeKey(user: ScopeUser): { practiceId: string | null; coachId: string | null } {
  if (user.role === 'COACH') return { practiceId: null, coachId: user.id }
  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    if (!user.practiceId) {
      throw new Error('Deze therapeut hoort bij geen praktijk; koppel eerst een praktijk.')
    }
    return { practiceId: user.practiceId, coachId: null }
  }
  throw new Error(`Rol ${user.role} mag geen behandelstatus zetten`)
}

/** Where-fragment om de rijen van deze lezer te vinden. Nooit leeg. */
export function careScopeWhere(user: ScopeUser): { practiceId: string } | { coachId: string } {
  const key = careScopeKey(user)
  return key.coachId ? { coachId: key.coachId } : { practiceId: key.practiceId! }
}
```

- [ ] **Step 4: Draai de tests**

Run: `npm test -- care-scope`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/care-scope.ts src/lib/__tests__/care-scope.test.ts
git commit -m "feat(patients): scope-helper voor de behandelstatus, praktijk of coach"
```

## Task 13: `setInactive` en `reactivate`

**Files:**
- Modify: `src/server/routers/patients.ts` (nieuwe mutations naast `delete` op 1254)
- Modify: `src/server/audit.ts` (union)

**Interfaces:**
- Consumes: `careScopeKey`/`careScopeWhere` uit taak 12.
- Produces: `patients.setInactive({ id, reason, note?, closeProgramIds, closeTraject })` en `patients.reactivate({ id })`. Taak 19 en 20 roepen ze aan.

Beide op `coachStaffProcedure`: consistent met `patients.update`, en het besluit is dat een coach het voor eigen atleten mag.

- [ ] **Step 1: Voeg de audit-events toe**

```ts
| 'PATIENT_DISCHARGED'
| 'PATIENT_REACTIVATED'
```

- [ ] **Step 2: Schrijf `setInactive`**

```ts
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
    // Zelfde vorm als patients.update (regel 923-928).
    const doel = await ctx.prisma.user.findFirst({
      where: { id: input.id, role: { in: ['PATIENT', 'ATHLETE'] } },
      select: { id: true },
    })
    if (!doel) throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen patiënten en atleten' })

    const scope = careScopeKey(ctx.user)

    await ctx.prisma.$transaction(async (tx) => {
      await tx.patientCareStatus.create({
        data: {
          patientId: input.id,
          practiceId: scope.practiceId,
          coachId: scope.coachId,
          dischargedAt: new Date(),
          dischargedById: ctx.user.id,
          reason: input.reason,
          note: input.note ?? null,
        },
      })
      if (input.closeProgramIds.length > 0) {
        await tx.program.updateMany({
          where: { id: { in: input.closeProgramIds }, patientId: input.id, status: 'ACTIVE' },
          data: { status: 'COMPLETED', endDate: new Date(), closedByDischarge: true },
        })
      }
      // Open insights sluiten, anders blijven ze tot hun expiresAt in het
      // aandacht-overzicht staan.
      await tx.insight.updateMany({
        where: { patientId: input.id, status: 'OPEN' },
        data: { status: 'DISMISSED' },
      })
    })

    if (input.closeTraject) {
      await closeOpenTrajectFor(ctx, input.id)
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
```

`closeOpenTrajectFor` is een kleine helper in `patients.ts` die het lopende traject opzoekt en dezelfde velden zet als `rehab.closeTraject`, met `outcome: 'UNKNOWN'`, plus een eigen `REHAB_TRAJECT_CLOSED`-auditregel. Twee handelingen, twee auditregels: anders is achteraf niet te zien of de therapeut het traject zelf sloot of dat het een neveneffect van het archiveren was.

- [ ] **Step 3: Schrijf `reactivate`**

```ts
reactivate: coachStaffProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    const scope = careScopeWhere(ctx.user)
    const rij = await ctx.prisma.patientCareStatus.findFirst({
      where: { patientId: input.id, ...scope },
    })
    if (!rij) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deze patiënt is niet inactief' })

    const onderbreking = Date.now() - rij.dischargedAt.getTime()

    await ctx.prisma.$transaction(async (tx) => {
      await tx.patientCareStatus.delete({ where: { id: rij.id } })
      const gesloten = await tx.program.findMany({
        where: { patientId: input.id, closedByDischarge: true },
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
            // springt computeCurrentWeekDay (patient.ts:104) meteen naar de
            // laatste week: die rekent kaal in dagen sinds startDate.
            startDate: p.startDate ? new Date(p.startDate.getTime() + onderbreking) : null,
          },
        })
      }
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
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/patients.ts src/server/audit.ts
git commit -m "feat(patients): patiënt inactief zetten en heractiveren"
```

## Task 14: Filter op de werklijsten

**Files:**
- Modify: `src/server/routers/patients.ts` (`list` 34-156, `caseload` 188-205, `search` 2114-2139, `therapistDashboard` 470-487 en `silentPatients` 688-696)

**Interfaces:**
- Produces: `patients.list` accepteert `{ include?: 'active' | 'archived' | 'all' }` met default `'active'`, en elke rij krijgt `dischargedAt: Date | null`. Taak 19 tot en met 22 en de iOS-app lezen dat veld.

De input is **optioneel**: `patients.list` heeft vandaag geen `.input()` en de iOS-app roept 'm zonder parameters aan.

- [ ] **Step 1: Geef `list` een optionele input**

```ts
list: coachStaffProcedure
  .input(z.object({
    include: z.enum(['active', 'archived', 'all']).default('active'),
  }).optional())
  .query(async ({ ctx, input }) => {
    const include = input?.include ?? 'active'
    const scope = careScopeWhere(ctx.user)
    // Filter onder AND naast de bestaande scope-OR. Een tweede OR-sleutel of
    // een object-spread wist de scoping; dat is de H1-lek van 27 juli,
    // gedocumenteerd op regel 2099-2104.
    const archiefFilter =
      include === 'all'
        ? {}
        : include === 'archived'
          ? { careStatuses: { some: scope } }
          : { careStatuses: { none: scope } }

    const patients = await ctx.prisma.user.findMany({
      where: { AND: [{ OR: [...bestaandeScopeOr] }, archiefFilter] },
      // ... bestaande select, uitgebreid met:
      // careStatuses: { where: scope, select: { dischargedAt: true, reason: true } }
    })
    // ... map, met dischargedAt: p.careStatuses[0]?.dischargedAt ?? null
  }),
```

- [ ] **Step 2: Voeg hetzelfde filter toe aan `caseload`, `search`, `therapistDashboard` en `silentPatients`**

Alle vier hebben hun eigen kopie van de scope-OR. Voeg overal `{ careStatuses: { none: careScopeWhere(ctx.user) } }` toe **als aparte AND-tak**. `search` toont op regel 2131-2138 al de goede vorm: `AND: [scopeFilter, queryFilter]`.

- [ ] **Step 3: Typecheck en handmatige controle**

```bash
npx tsc --noEmit
```

Zet daarna in de UI één patiënt op inactief en controleer dat hij uit `patients.list` verdwijnt, met `include: 'archived'` weer verschijnt, en dat `patients.get` op zijn detailpagina blijft werken.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/patients.ts
git commit -m "feat(patients): archieffilter op de werklijsten, dossier blijft leesbaar"
```

## Task 15: Filter op signalen, push en aggregaten

**Files:**
- Modify: `src/server/routers/insights.ts:64-68`
- Modify: `src/server/insights/compute.ts:73-99`
- Modify: `src/app/api/cron/daily-reminders/route.ts:85-101`
- Modify: `src/server/routers/programs.ts:571-608` (`reviewDue`)
- Modify: `src/server/routers/messages.ts:252-353` (`inbox`, `unreadTotal`)
- Modify: `src/server/routers/cohort.ts:51-64` en `:210-222`

**Interfaces:**
- Consumes: `careScopeWhere` uit taak 12.

- [ ] **Step 1: `insights.getDashboard`**

De patiënt-ids komen uit `patientTherapist.findMany({ therapistId, isActive: true, status: 'APPROVED' })`. Voeg toe: `patient: { careStatuses: { none: careScopeWhere(ctx.user) } }`.

- [ ] **Step 2: De CIE-cron**

`compute.ts:73-99` selecteert kandidaten. Voeg `careStatuses: { none: {} }` toe aan de user-where: de cron draait zonder lezer, dus hier telt elke uitbehandel-markering. Doe dit vóór `dispatchInsightNotifications` op regel 170-174, anders blijft de engine notificaties produceren.

- [ ] **Step 3: De ochtendpush**

`daily-reminders/route.ts:85-101` bouwt de ontvangerslijst uit iedereen met een pushtoken, bewust zonder rolfilter. Voeg `user: { careStatuses: { none: {} } }` toe. Filter hier en niet in de weekquery: de trainingsherinnering droogt vanzelf op als planning stopt, maar de herstel- en belastingpushes (regel 147-167) niet.

- [ ] **Step 4: `programs.reviewDue`**

Regel 571-608 scopet op `Program.creatorId`/`practiceId` en niet op de patiënt. Voeg een patiënt-tak toe: `patient: { careStatuses: { none: careScopeWhere(ctx.user) } }`. Dit is nodig omdat `shop.activateProgram` (`shop.ts:783`) programma's aanmaakt met de `creatorId` en `practiceId` van het sjabloon, buiten de therapeut om.

- [ ] **Step 5: `messages.inbox` en `unreadTotal`**

Zelfde tak op de patiënt-where. Alleen atleten zijn hier relevant: berichten zijn atleet-only (`messages.ts:68-89`). Zonder dit blijft de badge in `TherapistSidebar.tsx:130` oplichten voor iemand die uit alle lijsten verdwenen is.

- [ ] **Step 6: `cohort.therapistOverview` en `adminOverview`**

Twee verschillende where-vormen, allebei een aparte AND-tak.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 8: Commit**

```bash
git add src/server/routers/insights.ts src/server/insights/compute.ts src/app/api/cron/daily-reminders/route.ts src/server/routers/programs.ts src/server/routers/messages.ts src/server/routers/cohort.ts
git commit -m "feat(patients): inactieve patiënten uit signalen, push en aggregaten"
```

## Task 16: Planning stopt

**Files:**
- Create: `src/lib/care-cutoff.ts`
- Create: `src/lib/__tests__/care-cutoff.test.ts`
- Modify: `src/server/routers/patient.ts:2122-2147` (`calendarRange`)
- Modify: `src/server/routers/weekSchedules.ts:831-903` (`mySchedule`, `myWeekMeta`)

**Interfaces:**
- Produces: `planningCutoff(dischargedAt)` → `Date`, de eerste maandag ná de ontslagdatum, in Amsterdamse tijd.

Verbergen, niet verwijderen: verwijderen is onomkeerbaar en cascadeert via `WeekScheduleDay` naar items en oefeningen.

- [ ] **Step 1: Schrijf de falende test**

```ts
import { describe, expect, it } from 'vitest'
import { planningCutoff } from '../care-cutoff'

describe('planningCutoff', () => {
  it('geeft de eerstvolgende maandag, zodat de lopende week heel blijft', () => {
    // Woensdag 5 augustus 2026 -> maandag 10 augustus.
    const uit = planningCutoff(new Date('2026-08-05T09:00:00+02:00'))
    expect(uit.toISOString()).toBe('2026-08-09T22:00:00.000Z') // maandag 10 aug, NL-middernacht
  })

  it('schuift een maandag door naar de week erna', () => {
    const uit = planningCutoff(new Date('2026-08-10T09:00:00+02:00'))
    expect(uit.toISOString()).toBe('2026-08-16T22:00:00.000Z') // maandag 17 aug
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npm test -- care-cutoff`
Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Schrijf de implementatie**

```ts
import { addDaysKey, amsMidnight, mondayKeyOf } from './week-dates'

/**
 * Vanaf welke week de planning niet meer aan de patiënt getoond wordt: de
 * eerste maandag ná de ontslagdatum, zodat de lopende week heel blijft.
 *
 * Reken in Europe/Amsterdam. WeekSchedule.startDate staat als NL-middernacht
 * opgeslagen (2026-05-03T22:00Z is maandag 4 mei), dus een UTC-vergelijking
 * zet de knip een hele week verkeerd.
 */
export function planningCutoff(dischargedAt: Date): Date {
  const maandagVanDieWeek = mondayKeyOf(dischargedAt)
  return amsMidnight(addDaysKey(maandagVanDieWeek, 7))
}
```

De drie helpers bestaan met exact deze namen in `src/lib/week-dates.ts` (`mondayKeyOf` op regel 49, `addDaysKey` op 54, `amsMidnight` op 70), en de twee verwachte waarden in de test zijn tegen de echte implementatie nagerekend. Schrijf geen eigen `new Date(...)`-rekenwerk.

- [ ] **Step 4: Draai de test**

Run: `npm test -- care-cutoff`
Expected: PASS, 2 tests.

- [ ] **Step 5: Pas `calendarRange`, `mySchedule` en `myWeekMeta` toe**

In alle drie: haal de `PatientCareStatus` van de patiënt op (elke rij telt, ongeacht scope, want dit is de patiëntkant) en voeg toe aan de weekquery:

```ts
// Weken vanaf de eerste maandag ná het ontslag komen niet meer mee. Verbergen
// in plaats van verwijderen: dat is omkeerbaar en cascadeert niet.
...(cutoff ? { startDate: { lt: cutoff } } : {}),
```

Let op de legacy-rijen met `startDate: null`: elke bestaande query heeft daar een expliciete OR-tak voor. Neem die tak mee, anders lekken legacy-weken juist door.

- [ ] **Step 6: Typecheck en volledige suite**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/care-cutoff.ts src/lib/__tests__/care-cutoff.test.ts src/server/routers/patient.ts src/server/routers/weekSchedules.ts
git commit -m "feat(patients): planning stopt vanaf de maandag na het ontslag"
```

## Task 17: Schrijf-guards en de scope gelijktrekken

**Files:**
- Create: `src/server/lib/care-guard.ts`
- Modify: `src/server/routers/planTemplates.ts:453` (`applyToPatient`)
- Modify: `src/server/routers/weekSchedules.ts:910` (`scheduleProgram`), plus `save` 330-334, `delete` 441, `setDayProgram` 472, `setWeekMeta` 780, `deleteWeek` 818
- Modify: `src/server/routers/programs.ts:251-271` en `:398-469` (`create`, `duplicate`), plus `save` 307

**Interfaces:**
- Produces: `assertNotDischarged(prisma, user, patientId)`, gooit `CONFLICT` als de patiënt inactief is bij deze lezer.

- [ ] **Step 1: Schrijf de guard**

```ts
/**
 * Weigert nieuwe planning voor een uitbehandelde patiënt. Losse guard, geen
 * aanpassing van hasPatientAccess: het dossier moet leesbaar blijven, alleen
 * bijplannen stopt.
 */
export async function assertNotDischarged(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  const rij = await prisma.patientCareStatus.findFirst({
    where: { patientId, ...careScopeWhere(user) },
    select: { id: true },
  })
  if (rij) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Deze patiënt staat op inactief. Zet hem eerst weer in behandeling om te kunnen plannen.',
    })
  }
}
```

- [ ] **Step 2: Zet de guard op de bulk-planners**

`planTemplates.applyToPatient`, `weekSchedules.scheduleProgram`, en `programs.create`/`duplicate` met een `patientId`. Alle drie roepen `notifyNewSchedule` aan, dus zonder guard krijgt een uitbehandelde patiënt ook nog een melding.

- [ ] **Step 3: Trek de scope gelijk op de programma-mutaties**

`programs.save` (regel 307) is `creatorId === user.id || ADMIN` zonder praktijk-tak, terwijl `changeDay` (536-539) en `markReviewed` (624-628) die tak wél hebben. Zonder gelijktrekking faalt de bestaande knop "Afsluiten" al voor een collega, en dus ook de bulk-afsluiting bij het archiveren.

```ts
const magBewerken =
  existing.creatorId === ctx.user!.id ||
  ctx.user!.role === 'ADMIN' ||
  // Praktijk-tak expliciet aan de therapeut-rol gebonden: patiënten en
  // atleten delen de practiceId van hun therapeut.
  (ctx.user!.role === 'THERAPIST' && !!ctx.user!.practiceId && existing.practiceId === ctx.user!.practiceId)
if (!magBewerken) throw new TRPCError({ code: 'FORBIDDEN' })
```

Doe hetzelfde voor `weekSchedules.save`, `delete`, `setDayProgram`, `setWeekMeta` en `deleteWeek`, die nu op `creatorId: ctx.user.id` zoeken.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/care-guard.ts src/server/routers/planTemplates.ts src/server/routers/weekSchedules.ts src/server/routers/programs.ts
git commit -m "feat(patients): geen nieuwe planning voor inactieve patiënten"
```

## Task 18: Reactivatie-lekken dichten

**Files:**
- Modify: `src/server/routers/invite.ts:278-330` (`resend`) en `:728-745` (`finalize`)
- Modify: `src/server/routers/patients.ts:1076-1206` (`invite`) en `:1209-1247` (`resendInvite`)

**Interfaces:**
- Consumes: `careScopeWhere` uit taak 12.

Vier paden brengen een koppeling terug tot leven zonder de inactief-status aan te raken. Zonder reparatie krijg je een patiënt met een levende koppeling die in geen enkele lijst staat, zonder foutmelding. Dat is het moeilijkst herkenbare eindresultaat van deze hele feature.

- [ ] **Step 1: Hef de status op in alle vier de paden**

Voeg op elke plek waar `isActive: true` of `status: 'APPROVED'` op een bestaande `PatientTherapist`-rij wordt gezet, toe:

```ts
// Opnieuw uitnodigen betekent weer in behandeling. Zonder dit krijg je een
// patiënt met een levende koppeling die in geen enkele lijst verschijnt.
await tx.patientCareStatus.deleteMany({
  where: { patientId, ...careScopeWhere(ctx.user) },
})
```

In `invite.finalize` is er geen ingelogde therapeut in de context; gebruik daar de scope van de uitnodigende therapeut uit de `InviteCode`-rij.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 3: Handmatige controle**

Zet een testpatiënt op inactief, stuur een nieuwe uitnodiging, en controleer dat hij weer in `patients.list` staat.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/invite.ts src/server/routers/patients.ts
git commit -m "fix(patients): opnieuw uitnodigen heft de inactief-status op"
```

---

# Deel C: web-UI

## Task 19: Archiefweergave in de patiëntenlijst

**Files:**
- Modify: `src/app/(therapist)/therapist/patients/page.tsx` (quickfilters 52, 141-156, `patients.list` op 83)
- Modify: `src/components/patients/CaseloadTable.tsx` (`CaseloadRow` 22-40, `STATUS_WOORD` 49-53)

- [ ] **Step 1: Hernoem de bestaande quickfilter**

`active` kijkt nu op programmastatus, niet op behandelstatus. Die twee betekenissen gaan door elkaar lopen. Hernoem het label naar "met lopend schema" en laat de waarde ongemoeid.

- [ ] **Step 2: Voeg de archief-tab toe**

Een derde stand die `patients.list` aanroept met `{ include: 'archived' }`. In die stand zijn de kolommen aandacht en stille dagen betekenisloos: verberg ze en toon in plaats daarvan de ontslagdatum.

- [ ] **Step 3: Voeg de badge toe aan `CaseloadTable`**

`CaseloadRow` krijgt `dischargedAt: Date | null`. `STATUS_WOORD` kent nu alleen DRAFT, COMPLETED en ARCHIVED van het programma; de behandelstatus is een aparte badge, niet dezelfde.

- [ ] **Step 4: Controleer in de browser**

Start de preview, open `/therapist/patients`, wissel tussen de standen en controleer dat een gearchiveerde patiënt alleen in het archief staat.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(therapist\)/therapist/patients/page.tsx src/components/patients/CaseloadTable.tsx
git commit -m "feat(patients): archief-tab en inactief-badge in de patiëntenlijst"
```

## Task 20: Afsluitdialoog en archiefbanner op het patiëntdetail

**Files:**
- Create: `src/components/patients/DischargeDialog.tsx`
- Modify: `src/app/(therapist)/therapist/patients/[id]/page.tsx`

**Interfaces:**
- Consumes: `patients.setInactive` en `patients.reactivate` uit taak 13, `programs.list` voor de programmalijst, `rehab.getPatientTracker` voor het lopende traject.

- [ ] **Step 1: Bouw de dialoog**

Neem `src/components/patients/UnlinkDialog.tsx` als tekstmodel. De dialoog toont:

- een keuzelijst voor de reden (afgerond, voortijdig gestopt, doorverwezen, niet meer verschenen, anders)
- een optioneel notitieveld
- de lopende programma's, elk met een vinkje "afsluiten" dat standaard aan staat
- als er een traject loopt: een vinkje "revalidatietraject afsluiten", standaard aan

Copy volgt `docs/tone-of-voice.md`. Het verschil met "koppeling verbreken" moet expliciet in de tekst staan: verbreken verwijdert programma's en toegang, inactief zetten laat het dossier intact.

- [ ] **Step 2: Zet de actie in het bestaande actiemenu**

Naast "koppeling verbreken", niet ervoor: de twee moeten niet verwisseld kunnen worden.

- [ ] **Step 3: Voeg de archiefbanner toe**

Bovenaan de pagina, met wie en wanneer, de reden, en een knop "weer in behandeling" die `patients.reactivate` aanroept.

- [ ] **Step 4: Controleer in de browser**

Zet een testpatiënt op inactief met één programma dat doorloopt, controleer de banner, en zet hem weer actief. Controleer dat alleen het afgesloten programma terugkomt.

- [ ] **Step 5: Commit**

```bash
git add src/components/patients/DischargeDialog.tsx "src/app/(therapist)/therapist/patients/[id]/page.tsx"
git commit -m "feat(patients): afsluitdialoog en archiefbanner op het patiëntdetail"
```

## Task 21: Trajecthistorie in de rehab-tracker

**Files:**
- Modify: `src/components/rehab/RehabTracker.tsx`
- Modify: `src/components/rehab/RehabActivationToggle.tsx`
- Modify: `src/app/(therapist)/therapist/patients/[id]/page.tsx:853-856`

- [ ] **Step 1: Voeg de historie-sectie toe**

Onder het lopende traject een inklapbare lijst uit `rehab.listTrajects`: protocolnaam, periode, uitkomst, en hoeveel criteria behaald zijn. Klikken opent het afgesloten traject via `rehab.getTraject`, read-only.

- [ ] **Step 2: Voeg de afsluitknop toe**

"Traject afsluiten" met een uitkomst-keuze en een optionele notitie, via `rehab.closeTraject`. Bij een net afgesloten traject een "heropenen"-knop via `rehab.reopenTraject`; verberg die zodra er een nieuwer traject is.

- [ ] **Step 3: Hernoem "protocol aanzetten"**

Zodra er historie is, is het "nieuw traject starten". De huidige uitzet-dialoog belooft dat vinkjes bewaard blijven; die copy klopt niet meer en moet mee.

- [ ] **Step 4: Verberg het rehab-blok voor coaches**

Regel 853-856 rendert `RehabTracker` ook voor een coach, terwijl `rehab.ts:25-27` COACH hard weigert. Die krijgt nu stil een FORBIDDEN. Verberg het blok op basis van de rol.

- [ ] **Step 5: Controleer in de browser en commit**

```bash
git add src/components/rehab/ "src/app/(therapist)/therapist/patients/[id]/page.tsx"
git commit -m "feat(rehab): trajecthistorie en afsluiten in de tracker"
```

## Task 22: Weekplanner en release-note

**Files:**
- Modify: `src/app/(therapist)/therapist/week-planner/page.tsx:1527` en de mutatie-hooks 1582-1690
- Modify: `src/lib/release-notes.ts:22`

- [ ] **Step 1: Markeer gearchiveerde patiënten in de planner**

De patiëntkeuze leest `patients.list`; roep die aan met `include: 'all'` en zet een badge bij de gearchiveerde. Zet de mutatie-knoppen uit als er een gearchiveerde patiënt gekozen is; er is nu geen read-only modus.

- [ ] **Step 2: Schrijf de release-note**

`release-notes.ts` staat sinds 24 juni stil en is het enige in-app kanaal naar therapeuten. Zonder aankondiging leest dit als storing: patiënten verdwijnen uit tien pickers, programma's springen op afgerond, en rehab-vinkjes komen niet meer terug bij opnieuw aanzetten.

Noem expliciet: het archief en waar je het vindt, dat het dossier leesbaar blijft, dat een nieuw traject schoon begint, en dat opnieuw uitnodigen een patiënt weer actief maakt.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(therapist)/therapist/week-planner/page.tsx" src/lib/release-notes.ts
git commit -m "feat(patients): planner markeert gearchiveerde patiënten, plus release-note"
```

---

# Deel D: iOS

Pas beginnen als deel A tot en met C live staan. Werk in `/Users/eva/mbt-gym-mobile`, met de dark-ui componenten van die repo.

## Task 23: Archief en inactief-badge in de app

**Files:**
- Modify: `app/patients.tsx`
- Modify: `app/patient/[id].tsx`
- Modify: `app/(tabs)/index.tsx:1193`

- [ ] **Step 1: Voeg een archief-segment toe aan de patiëntenlijst**

Via de nieuwe `include`-input op `patients.list`. Zonder parameters blijft de aanroep werken, dus oude builds veranderen niet.

- [ ] **Step 2: Badge en banner op het patiëntdetail**

Lees `dischargedAt` uit `patients.get`. Toon een banner met de datum en de reden. De actie zelf (inactief zetten) mag in deze ronde nog web-only blijven; alleen tonen is genoeg om verwarring te voorkomen.

- [ ] **Step 3: Typecheck en commit**

```bash
npx tsc --noEmit
git add app/
git commit -m "feat(patients): archief-segment en inactief-banner in de app"
```

## Task 24: Traject afsluiten en historie in de app

**Files:**
- Modify: `components/rehab-section.tsx`
- Modify: `app/rehab.tsx`

- [ ] **Step 1: Voeg afsluiten en historie toe aan de therapeut-sectie**

`rehab.closeTraject` met een uitkomst-keuze, en `rehab.listTrajects` als inklapbare historie. De bestaande aanroepen op regel 56, 81, 94 en 236 blijven `patientId` sturen.

- [ ] **Step 2: Toon een afgerond-staat op het patiëntscherm**

`app/rehab.tsx` krijgt `null` terug zodra het traject is afgesloten. Toon dan "je revalidatietraject is afgerond" in plaats van een leeg scherm. Laat `tracker.phases.map` op regel 87 niet zonder guard staan.

- [ ] **Step 3: Test in de simulator**

Open het rehab-scherm als patiënt met een afgesloten traject en als therapeut met historie.

- [ ] **Step 4: Verhoog het buildnummer en commit**

```bash
npx tsc --noEmit
git add app/ components/ app.json
git commit -m "feat(rehab): traject afsluiten en historie in de app"
```

---

## Zelfreview

**Spec-dekking.** Sectie 4 (security) is buiten dit plan gevallen omdat het op 31 juli al is uitgevoerd; sectie 13 stap 1 verwijst daarnaar. Sectie 5.1 → taak 11 en 12. Sectie 5.2 → taak 2 tot en met 4. Sectie 6 → taak 1 tot en met 9. Sectie 7 → taak 6, 7, 13, 14, 15, 17, 18. Sectie 8 → taak 19 tot en met 22. Sectie 9 → taak 23 en 24. Sectie 11 → taak 10, 12, 16 en de checks in taak 9.

**Niet gedekt en bewust zo:** de AVG-export uitbreiden met de rehab-trajecten (`gdpr.exportMyData`), `scripts/delete-user.ts` uitbreiden met de twee `RESTRICT`-relaties, en `dpa.listPatients`. Alle drie staan in sectie 12 van de spec als open punt. De eerste twee zijn losse opruimtaken die geen enkele stap in dit plan blokkeren; als je ze mee wil nemen, horen ze als taak 25 en 26 achteraan.

**Typeconsistentie.** `careScopeKey` geeft `{ practiceId, coachId }` (beide nullable) en wordt gebruikt in taak 13 bij het aanmaken van de rij. `careScopeWhere` geeft één gevulde sleutel en wordt gebruikt in elke where. Die twee zijn bewust verschillend en heten daarom anders. `openTrackerFor` uit taak 6 wordt hergebruikt in taak 7. `planningCutoff` uit taak 16 wordt alleen daar gebruikt.
