# Atletengroepen (deel 1: groepen, groepskalender, verzenden) — bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een coach maakt een groep atleten, plant er in de gewone weekplanner een kalender voor en stuurt gekozen weken met één knop naar alle leden; daarna is elke kopie van de atleet zelf.

**Architecture:** Nieuwe tabellen `athlete_groups`, `athlete_group_members`, `athlete_group_staff`; de groepskalender bestaat uit gewone `week_schedules` met `groupId` (zoals plan-sjablonen `planTemplateId` gebruiken), zodat de hele planner ongewijzigd werkt. Verzenden is een pure planningsfunctie (`planVerzending`) plus een transactie per lid die groepsitems van de gekozen weken vervangt via de bestaande `copyItemToDay`. Herkomst op de kopie via `groupId` + `sourceItemId` op het item.

**Tech Stack:** Next.js 16 App Router, tRPC v11 + zod 4, Prisma 7 op Supabase Postgres (migraties handmatig via `npx prisma db execute`), React 19, vitest 4, sonner, dark-ui componenten.

Deel 2 (groepsdashboard) krijgt een eigen plan zodra dit deel staat; de spec staat in `docs/superpowers/specs/2026-09-14-atletengroepen-design.md`.

## Global Constraints

- Nieuwe public-tabellen krijgen in dezelfde migratie `ENABLE ROW LEVEL SECURITY` + policy `default_deny` (zie `supabase/migrations/20260824_polar.sql`).
- Migraties worden NIET automatisch uitgerold: na het schrijven `set -a; source .env.local; set +a; npx prisma db execute --file <bestand>` en daarna `npx prisma generate` en de dev-server herstarten (anders "Unknown field").
- Geen nieuwe Json-kolommen (TS2589-regel uit AGENTS.md); alle nieuwe kolommen zijn scalars.
- Statische Nederlandse foutmeldingen in routers krijgen een vertaling in `src/server/i18n/error-messages.ts` (test `error-messages.test.ts` faalt anders).
- Tone of voice: geen em-dashes, geen emoji, volledige zinnen in UI-teksten; accentkleur `P.brand` (oranje).
- Dev-database = productiedatabase: alleen testdata op de testatleet "Jurre test"; alles wat je aanmaakt bij verificatie ook weer opruimen.
- Commits in `/Users/eva/mbt-gym` op branch `feat/atletengroepen` (aanmaken vanaf `main`), commitregels eindigen met `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Type-check: `npx tsc --noEmit`; tests: `npx vitest run <pad>`; lint: `npx eslint <bestanden>`.

---

## Bestandsoverzicht

- Create: `supabase/migrations/20260914_atletengroepen.sql` (tabellen, kolommen, RLS)
- Modify: `prisma/schema.prisma` (enum `AthleteGroupRole`, modellen `AthleteGroup`, `AthleteGroupMember`, `AthleteGroupStaff`; `WeekSchedule.groupId`; `WeekScheduleDayItem.groupId`/`sourceItemId`; relaties op `User`)
- Create: `src/server/lib/group-access.ts` (rollen, `assertGroupRole`, `groupsWhereForUser`)
- Create: `src/server/lib/group-send.ts` (pure `planVerzending`) + `src/server/lib/__tests__/group-send.test.ts`
- Create: `src/server/routers/athleteGroups.ts` (router) en registreren in `src/server/routers/_app.ts`
- Modify: `src/server/routers/weekSchedules.ts` (`create` en `listWithItems` met `groupId`; guard `assertMagKalenderBewerken`)
- Modify: `src/server/routers/planTemplates.ts` (stand "vervangen" laat groepsitems staan)
- Modify: `src/server/routers/patient.ts` (`calendarRange` en `getTodayExercises` geven `groupPlanName` mee)
- Modify: `src/server/i18n/error-messages.ts`
- Create: `src/components/week-planner/GroupSendDialog.tsx` (verzendvenster)
- Modify: `src/app/(therapist)/therapist/week-planner/page.tsx` (groepen in de kiezer, kalendereigenaar, knop "Stuur naar iedereen")
- Create: `src/app/(coach)/coach/groups/page.tsx`, `src/app/(coach)/coach/groups/[id]/page.tsx`; therapeut-spiegels `src/app/(therapist)/therapist/groups/page.tsx`, `src/app/(therapist)/therapist/groups/[id]/page.tsx` (re-export, zoals `coach/athletes/page.tsx` doet)
- Create: `src/components/groups/GroupsOverview.tsx`, `src/components/groups/GroupDetail.tsx` (gedeeld door beide portalen)
- Modify: `src/components/layout/TherapistSidebar.tsx` (menupunt Groepen in beide lijsten)
- Modify: `src/app/(athlete)/athlete/schedule/page.tsx` (label "Onderdeel van …")
- Modify: `AGENTS.md` (korte sectie), memory-bestand na oplevering

---

### Task 1: Migratie en Prisma-schema

**Files:**
- Create: `supabase/migrations/20260914_atletengroepen.sql`
- Modify: `prisma/schema.prisma` (na `model WeekPlanTemplate`, bij `model WeekSchedule`, bij `model WeekScheduleDayItem`, bij de relaties op `model User` rond regel 384)

**Interfaces:**
- Produces: Prisma-modellen `AthleteGroup`, `AthleteGroupMember`, `AthleteGroupStaff`, enum `AthleteGroupRole` (`OWNER | VIEWER | PLANNER | MANAGER`); kolommen `WeekSchedule.groupId`, `WeekScheduleDayItem.groupId`, `WeekScheduleDayItem.sourceItemId`.

- [ ] **Step 1: Schrijf de migratie**

```sql
-- Atletengroepen: een coach plant één kalender voor een groep en stuurt die
-- naar alle leden (spec docs/superpowers/specs/2026-09-14-atletengroepen-design.md).
-- Additief en idempotent.

DO $$ BEGIN
  CREATE TYPE "AthleteGroupRole" AS ENUM ('OWNER', 'VIEWER', 'PLANNER', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_groups" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "planName"    TEXT,
  "description" TEXT,
  "ownerId"     TEXT NOT NULL,
  "startDate"   TIMESTAMP(3) NOT NULL,
  "endDate"     TIMESTAMP(3),
  "lastSentAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "athlete_groups_ownerId_idx" ON "athlete_groups"("ownerId");
DO $$ BEGIN
  ALTER TABLE "athlete_groups" ADD CONSTRAINT "athlete_groups_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_group_members" (
  "id"         TEXT NOT NULL,
  "groupId"    TEXT NOT NULL,
  "patientId"  TEXT NOT NULL,
  "note"       TEXT,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSentAt" TIMESTAMP(3),
  CONSTRAINT "athlete_group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_group_members_groupId_patientId_key" ON "athlete_group_members"("groupId", "patientId");
CREATE INDEX IF NOT EXISTS "athlete_group_members_patientId_idx" ON "athlete_group_members"("patientId");
DO $$ BEGIN
  ALTER TABLE "athlete_group_members" ADD CONSTRAINT "athlete_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "athlete_group_members" ADD CONSTRAINT "athlete_group_members_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_group_staff" (
  "id"      TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "role"    "AthleteGroupRole" NOT NULL DEFAULT 'VIEWER',
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_group_staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_group_staff_groupId_userId_key" ON "athlete_group_staff"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "athlete_group_staff_userId_idx" ON "athlete_group_staff"("userId");
DO $$ BEGIN
  ALTER TABLE "athlete_group_staff" ADD CONSTRAINT "athlete_group_staff_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "athlete_group_staff" ADD CONSTRAINT "athlete_group_staff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Groepskalender: weekschema's aan een groep i.p.v. een atleet.
ALTER TABLE "week_schedules" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "week_schedules_groupId_weekNumber_idx" ON "week_schedules"("groupId", "weekNumber");
DO $$ BEGIN
  ALTER TABLE "week_schedules" ADD CONSTRAINT "week_schedules_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Herkomst op de kopie bij de atleet.
ALTER TABLE "week_schedule_day_items"
  ADD COLUMN IF NOT EXISTS "groupId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;
CREATE INDEX IF NOT EXISTS "week_schedule_day_items_groupId_idx" ON "week_schedule_day_items"("groupId");
DO $$ BEGIN
  ALTER TABLE "week_schedule_day_items" ADD CONSTRAINT "week_schedule_day_items_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS verplicht (anon-key zit in de browserbundle); Prisma bypasst als owner.
ALTER TABLE "athlete_groups" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_groups" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "athlete_group_members" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_group_members" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "athlete_group_staff" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_group_staff" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Prisma-schema**

Na `model WeekPlanTemplate { … }`:

```prisma
enum AthleteGroupRole {
  OWNER
  VIEWER
  PLANNER
  MANAGER
}

/// Groep atleten van een coach met één gedeelde kalender (week_schedules met
/// groupId). "Stuur naar iedereen" kopieert gekozen weken naar de leden; de
/// kopie draagt groupId + sourceItemId. Zie docs/superpowers/specs/2026-09-14-atletengroepen-design.md.
model AthleteGroup {
  id          String    @id @default(cuid())
  name        String
  /// Programmanaam die de atleet ziet ("Periodisering 2026/27"); leeg = name.
  planName    String?
  description String?
  ownerId     String
  owner       User      @relation("AthleteGroupOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  /// Maandag van week 1.
  startDate   DateTime
  endDate     DateTime?
  lastSentAt  DateTime?
  members     AthleteGroupMember[]
  staff       AthleteGroupStaff[]
  schedules   WeekSchedule[]
  sentItems   WeekScheduleDayItem[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([ownerId])
  @@map("athlete_groups")
}

model AthleteGroupMember {
  id         String       @id @default(cuid())
  groupId    String
  group      AthleteGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  patientId  String
  patient    User         @relation("AthleteGroupMemberships", fields: [patientId], references: [id], onDelete: Cascade)
  /// Notitie van de staf over dit lid; nooit voor de atleet.
  note       String?
  addedAt    DateTime     @default(now())
  lastSentAt DateTime?

  @@unique([groupId, patientId])
  @@index([patientId])
  @@map("athlete_group_members")
}

model AthleteGroupStaff {
  id      String           @id @default(cuid())
  groupId String
  group   AthleteGroup     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId  String
  user    User             @relation("AthleteGroupStaff", fields: [userId], references: [id], onDelete: Cascade)
  role    AthleteGroupRole @default(VIEWER)
  addedAt DateTime         @default(now())

  @@unique([groupId, userId])
  @@index([userId])
  @@map("athlete_group_staff")
}
```

In `model WeekSchedule`, direct na `planTemplate   WeekPlanTemplate? …`:

```prisma
  /// Groepskalender: gevuld op de weken van een atletengroep (patientId leeg).
  groupId        String?
  group          AthleteGroup?     @relation(fields: [groupId], references: [id], onDelete: Cascade)
```
en bij de indexen: `@@index([groupId, weekNumber])`.

In `model WeekScheduleDayItem`, vóór `createdAt`:

```prisma
  /// Herkomst: gezet door athleteGroups.send. Null = eigen item van de atleet.
  groupId      String?
  group        AthleteGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  /// Het groepsitem waarvan dit een kopie is (geen FK: het bronitem mag weg).
  sourceItemId String?
```
en `@@index([groupId])`.

Op `model User`, na `careStatusesReactivated …`:

```prisma
  athleteGroupsOwned      AthleteGroup[]       @relation("AthleteGroupOwner")
  athleteGroupMemberships AthleteGroupMember[] @relation("AthleteGroupMemberships")
  athleteGroupStaff       AthleteGroupStaff[]  @relation("AthleteGroupStaff")
```

- [ ] **Step 3: Migratie draaien, client genereren, type-check**

```bash
set -a; source .env.local; set +a
npx prisma db execute --file supabase/migrations/20260914_atletengroepen.sql
npx prisma generate
npx tsc --noEmit
```
Verwacht: "Script executed successfully", "Generated Prisma Client", geen type-fouten. Herstart de dev-server als die draait.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/atletengroepen main
git add supabase/migrations/20260914_atletengroepen.sql prisma/schema.prisma
git commit -m "feat(groepen): tabellen en kolommen voor atletengroepen, groepskalender en herkomst op items

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Rollen en toegang (`group-access.ts`)

**Files:**
- Create: `src/server/lib/group-access.ts`
- Test: `src/server/lib/__tests__/group-access.test.ts`

**Interfaces:**
- Produces: `type GroupRole = 'OWNER' | 'VIEWER' | 'PLANNER' | 'MANAGER'`; `roleAllows(role, minimaal): boolean`; `assertGroupRole(prisma, user, groupId, minimaal): Promise<{ id: string; ownerId: string; role: GroupRole }>`; `groupsWhereForUser(user): Prisma.AthleteGroupWhereInput`.

- [ ] **Step 1: Failing test voor `roleAllows`**

```ts
// src/server/lib/__tests__/group-access.test.ts
import { describe, it, expect } from 'vitest'
import { roleAllows } from '../group-access'

describe('roleAllows', () => {
  it('laat een hogere of gelijke rol door', () => {
    expect(roleAllows('OWNER', 'MANAGER')).toBe(true)
    expect(roleAllows('MANAGER', 'MANAGER')).toBe(true)
    expect(roleAllows('PLANNER', 'VIEWER')).toBe(true)
  })
  it('weigert een lagere rol', () => {
    expect(roleAllows('VIEWER', 'PLANNER')).toBe(false)
    expect(roleAllows('PLANNER', 'MANAGER')).toBe(false)
    expect(roleAllows('MANAGER', 'OWNER')).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verwacht FAIL** — `npx vitest run src/server/lib/__tests__/group-access.test.ts` (module niet gevonden).

- [ ] **Step 3: Implementatie**

```ts
// src/server/lib/group-access.ts
import { TRPCError } from '@trpc/server'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Rollen in een atletengroep, oplopend. De tabel in de spec is leidend:
 * VIEWER kijkt mee, PLANNER bewerkt de groepskalender, MANAGER verzendt en
 * beheert leden, OWNER (de coach) beheert ook de staf en mag verwijderen.
 */
export type GroupRole = 'OWNER' | 'VIEWER' | 'PLANNER' | 'MANAGER'

const RANG: Record<GroupRole, number> = { VIEWER: 1, PLANNER: 2, MANAGER: 3, OWNER: 4 }

export function roleAllows(role: GroupRole, minimaal: GroupRole): boolean {
  return RANG[role] >= RANG[minimaal]
}

type GroupUser = { id: string; role: string }

/** Welke groepen ziet deze gebruiker? Admin alles, de rest waar hij staf is. */
export function groupsWhereForUser(user: GroupUser): Prisma.AthleteGroupWhereInput {
  if (user.role === 'ADMIN') return {}
  return { staff: { some: { userId: user.id } } }
}

/**
 * Controleer de rol van de gebruiker in de groep. Admin leest altijd mee maar
 * schrijft niet (zoals overal in het coachportaal). Gooit NOT_FOUND als de
 * groep niet bestaat of onzichtbaar is, FORBIDDEN bij te weinig rechten.
 */
export async function assertGroupRole(
  prisma: PrismaClient,
  user: GroupUser,
  groupId: string,
  minimaal: GroupRole,
): Promise<{ id: string; ownerId: string; role: GroupRole }> {
  const group = await prisma.athleteGroup.findUnique({
    where: { id: groupId },
    select: { id: true, ownerId: true, staff: { where: { userId: user.id }, select: { role: true } } },
  })
  if (!group) throw new TRPCError({ code: 'NOT_FOUND', message: 'Groep niet gevonden' })
  const eigen = group.staff[0]?.role as GroupRole | undefined
  if (!eigen) {
    if (user.role === 'ADMIN') {
      if (minimaal === 'VIEWER') return { id: group.id, ownerId: group.ownerId, role: 'VIEWER' }
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Als beheerder kijk je alleen mee in een groep' })
    }
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Groep niet gevonden' })
  }
  if (!roleAllows(eigen, minimaal)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Onvoldoende rechten in deze groep' })
  }
  return { id: group.id, ownerId: group.ownerId, role: eigen }
}
```

- [ ] **Step 4: Run, verwacht PASS.** Voeg de drie meldingen toe aan `src/server/i18n/error-messages.ts` onder een kop `// Atletengroepen`:

```ts
  'Groep niet gevonden': 'Group not found',
  'Als beheerder kijk je alleen mee in een groep': 'As an admin you can only view a group',
  'Onvoldoende rechten in deze groep': 'Insufficient rights in this group',
```
Run `npx vitest run src/server/i18n` → PASS.

- [ ] **Step 5: Commit** — `git add src/server/lib/group-access.ts src/server/lib/__tests__/group-access.test.ts src/server/i18n/error-messages.ts && git commit -m "feat(groepen): rollen en toegangscontrole per groep" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 3: Pure verzendplanning (`group-send.ts`)

**Files:**
- Create: `src/server/lib/group-send.ts`
- Test: `src/server/lib/__tests__/group-send.test.ts`

**Interfaces:**
- Consumes: `addDaysKey` uit `@/lib/week-dates`.
- Produces:
```ts
export type GroepsWeek = { id: string; monday: string; days: { dayOfWeek: number; items: { id: string }[] }[] }
export type LidWeek = { id: string; monday: string; items: { id: string; dayOfWeek: number; groupId: string | null; gelogd: boolean }[] }
export type VerzendStap = { monday: string; lidWeekId: string | null; verwijderen: string[]; kopieren: { bronItemId: string; dayOfWeek: number }[] }
export function planVerzending(args: { groupId: string; groepsWeken: GroepsWeek[]; lidWeken: LidWeek[]; vandaag: string }): VerzendStap[]
```
`monday`/`vandaag` zijn datumsleutels `YYYY-MM-DD`; `dayOfWeek` 0 = maandag (zoals `WeekScheduleDay.dayOfWeek`).

- [ ] **Step 1: Failing tests**

```ts
// src/server/lib/__tests__/group-send.test.ts
import { describe, it, expect } from 'vitest'
import { planVerzending, type GroepsWeek, type LidWeek } from '../group-send'

const G = 'groep-a'
const week = (monday: string, items: Array<[number, string]>): GroepsWeek => ({
  id: `gw-${monday}`, monday,
  days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ dayOfWeek: d, items: items.filter(([dow]) => dow === d).map(([, id]) => ({ id })) })),
})

describe('planVerzending', () => {
  it('kopieert alle groepsitems naar een lid zonder week (week wordt aangemaakt)', () => {
    const stappen = planVerzending({
      groupId: G, vandaag: '2026-10-05',
      groepsWeken: [week('2026-10-05', [[0, 'a'], [2, 'b']])],
      lidWeken: [],
    })
    expect(stappen).toEqual([{ monday: '2026-10-05', lidWeekId: null, verwijderen: [], kopieren: [{ bronItemId: 'a', dayOfWeek: 0 }, { bronItemId: 'b', dayOfWeek: 2 }] }])
  })

  it('vervangt alleen items van deze groep en laat eigen items en andere groepen staan', () => {
    const lid: LidWeek = { id: 'lw', monday: '2026-10-05', items: [
      { id: 'oud-a', dayOfWeek: 0, groupId: G, gelogd: false },
      { id: 'eigen', dayOfWeek: 0, groupId: null, gelogd: false },
      { id: 'ander', dayOfWeek: 1, groupId: 'groep-b', gelogd: false },
    ] }
    const [stap] = planVerzending({ groupId: G, vandaag: '2026-10-05', groepsWeken: [week('2026-10-05', [[0, 'a']])], lidWeken: [lid] })
    expect(stap.lidWeekId).toBe('lw')
    expect(stap.verwijderen).toEqual(['oud-a'])
    expect(stap.kopieren).toEqual([{ bronItemId: 'a', dayOfWeek: 0 }])
  })

  it('laat dagen vóór vandaag en gelogde items met rust', () => {
    const lid: LidWeek = { id: 'lw', monday: '2026-10-05', items: [
      { id: 'ma', dayOfWeek: 0, groupId: G, gelogd: false },
      { id: 'wo-gelogd', dayOfWeek: 2, groupId: G, gelogd: true },
      { id: 'vr', dayOfWeek: 4, groupId: G, gelogd: false },
    ] }
    const [stap] = planVerzending({
      groupId: G, vandaag: '2026-10-07',
      groepsWeken: [week('2026-10-05', [[0, 'a'], [2, 'b'], [4, 'c']])],
      lidWeken: [lid],
    })
    expect(stap.verwijderen).toEqual(['vr'])
    expect(stap.kopieren).toEqual([{ bronItemId: 'c', dayOfWeek: 4 }])
  })

  it('slaat een groepsweek die helemaal in het verleden ligt over', () => {
    expect(planVerzending({ groupId: G, vandaag: '2026-10-20', groepsWeken: [week('2026-10-05', [[0, 'a']])], lidWeken: [] })).toEqual([])
  })

  it('kopieert op de dag van vandaag wel, want die is nog niet voorbij', () => {
    const [stap] = planVerzending({ groupId: G, vandaag: '2026-10-07', groepsWeken: [week('2026-10-05', [[2, 'b']])], lidWeken: [] })
    expect(stap.kopieren).toEqual([{ bronItemId: 'b', dayOfWeek: 2 }])
  })
})
```

- [ ] **Step 2: Run, verwacht FAIL** — `npx vitest run src/server/lib/__tests__/group-send.test.ts`.

- [ ] **Step 3: Implementatie**

```ts
// src/server/lib/group-send.ts
import { addDaysKey } from '@/lib/week-dates'

/**
 * Wat "Stuur naar iedereen" per lid en per week gaat doen, als pure functie
 * zodat de regels zonder database te testen zijn:
 *  - per gekozen groepsweek de week van het lid op dezelfde maandag zoeken
 *    (null = aanmaken);
 *  - in die week alle items van deze groep verwijderen, behalve op dagen vóór
 *    vandaag en items met een gelogde sessie;
 *  - de groepsitems van dagen vanaf vandaag kopiëren.
 * Eigen items, andere groepen en andere programma's blijven staan.
 */
export type GroepsWeek = { id: string; monday: string; days: { dayOfWeek: number; items: { id: string }[] }[] }
export type LidWeek = { id: string; monday: string; items: { id: string; dayOfWeek: number; groupId: string | null; gelogd: boolean }[] }
export type VerzendStap = {
  monday: string
  lidWeekId: string | null
  verwijderen: string[]
  kopieren: { bronItemId: string; dayOfWeek: number }[]
}

export function planVerzending(args: { groupId: string; groepsWeken: GroepsWeek[]; lidWeken: LidWeek[]; vandaag: string }): VerzendStap[] {
  const { groupId, groepsWeken, lidWeken, vandaag } = args
  const lidPerMaandag = new Map(lidWeken.map(w => [w.monday, w]))
  const stappen: VerzendStap[] = []
  for (const gw of groepsWeken) {
    const nogNietVoorbij = (dayOfWeek: number) => addDaysKey(gw.monday, dayOfWeek) >= vandaag
    if (![0, 1, 2, 3, 4, 5, 6].some(nogNietVoorbij)) continue
    const lid = lidPerMaandag.get(gw.monday) ?? null
    const verwijderen = (lid?.items ?? [])
      .filter(it => it.groupId === groupId && !it.gelogd && nogNietVoorbij(it.dayOfWeek))
      .map(it => it.id)
    const kopieren = gw.days
      .filter(d => nogNietVoorbij(d.dayOfWeek))
      .flatMap(d => d.items.map(it => ({ bronItemId: it.id, dayOfWeek: d.dayOfWeek })))
    stappen.push({ monday: gw.monday, lidWeekId: lid?.id ?? null, verwijderen, kopieren })
  }
  return stappen
}
```

- [ ] **Step 4: Run, verwacht PASS.** Als de tweede test faalt op volgorde van `kopieren`: de volgorde is per dag oplopend en binnen een dag zoals de groepsweek ze aanlevert; pas de test niet aan, controleer de `flatMap`.

- [ ] **Step 5: Commit** — `git add src/server/lib/group-send.ts src/server/lib/__tests__/group-send.test.ts && git commit -m "feat(groepen): pure verzendplanning per lid en week" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 4: Router `athleteGroups` (groepen, leden, staf, weken, verzenden)

**Files:**
- Create: `src/server/routers/athleteGroups.ts`
- Modify: `src/server/routers/_app.ts` (import + `athleteGroups: athleteGroupsRouter,`)
- Modify: `src/server/routers/weekSchedules.ts` (exporteer `bewerkbareWeken` niet; de router hieronder heeft een eigen scope-filter zoals `planTemplates.applyToPatient`)
- Modify: `src/server/i18n/error-messages.ts`

**Interfaces:**
- Consumes: `assertGroupRole`, `groupsWhereForUser` (Task 2); `planVerzending` (Task 3); `copyItemToDay`, `COPY_ITEM_INCLUDE` uit `./weekSchedules`; `assertNotDischarged` uit `@/server/lib/care-guard`; `notifyNewSchedule` uit `@/server/push/notify`; `mondayKeyOf`, `addDaysKey`, `amsMidnight`, `dateKey` uit `@/lib/week-dates`.
- Produces (tRPC): `athleteGroups.list`, `get`, `create`, `update`, `delete`, `addMembers`, `removeMember`, `setMemberNote`, `addStaff`, `setStaffRole`, `removeStaff`, `weeks`, `send`. Vormen staan in de code hieronder; de UI-taken bouwen daarop.

- [ ] **Step 1: Router schrijven**

```ts
// src/server/routers/athleteGroups.ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, coachStaffProcedure } from '@/server/trpc'
import { assertGroupRole, groupsWhereForUser, type GroupRole } from '@/server/lib/group-access'
import { planVerzending, type GroepsWeek, type LidWeek } from '@/server/lib/group-send'
import { assertNotDischarged } from '@/server/lib/care-guard'
import { notifyNewSchedule } from '@/server/push/notify'
import { copyItemToDay, COPY_ITEM_INCLUDE } from './weekSchedules'
import { mondayKeyOf, addDaysKey, amsMidnight, dateKey, isDateKey } from '@/lib/week-dates'

const createId = () => crypto.randomUUID()
const rolEnum = z.enum(['VIEWER', 'PLANNER', 'MANAGER'])

/**
 * Atletengroepen: verzendlijst plus één gedeelde kalender (week_schedules met
 * groupId). Rechten per rol staan in lib/group-access.ts; elke procedure
 * dwingt zijn minimum af op de server, de UI verbergt alleen knoppen.
 */

/** Mag deze staf dit lid toevoegen? Coach: directe koppeling; therapeut: eigen patiënt of praktijk. */
async function assertLidKoppeling(prisma: PrismaClient, user: { id: string; role: string; practiceId: string | null }, patientId: string) {
  if (user.role === 'ADMIN') return
  const viaPractice = user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
        ...viaPractice,
      ],
    },
    select: { id: true },
  })
  if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze atleet' })
}

const groepSelect = {
  id: true, name: true, planName: true, description: true, ownerId: true,
  startDate: true, endDate: true, lastSentAt: true, createdAt: true,
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true, schedules: true } },
} as const

export const athleteGroupsRouter = createTRPCRouter({
  /** Mijn groepen (staf of eigenaar; admin alles) met ledenaantal en rol. */
  list: coachStaffProcedure.query(async ({ ctx }) => {
    const groepen = await ctx.prisma.athleteGroup.findMany({
      where: groupsWhereForUser(ctx.user),
      select: { ...groepSelect, staff: { where: { userId: ctx.user.id }, select: { role: true } } },
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    })
    return groepen.map(g => ({
      ...g,
      // Admin zonder stafrij kijkt mee als VIEWER.
      role: (g.staff[0]?.role ?? 'VIEWER') as GroupRole,
      memberCount: g._count.members,
      weekCount: g._count.schedules,
    }))
  }),

  get: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const mijn = await assertGroupRole(ctx.prisma, ctx.user, input.id, 'VIEWER')
      const g = await ctx.prisma.athleteGroup.findUniqueOrThrow({
        where: { id: input.id },
        select: {
          ...groepSelect,
          members: {
            select: {
              id: true, patientId: true, note: true, addedAt: true, lastSentAt: true,
              patient: { select: { id: true, name: true, email: true } },
            },
            orderBy: { addedAt: 'asc' },
          },
          staff: {
            select: { id: true, userId: true, role: true, addedAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { addedAt: 'asc' },
          },
        },
      })
      return { ...g, role: mijn.role, memberCount: g._count.members, weekCount: g._count.schedules }
    }),

  create: coachStaffProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(80),
      planName: z.string().trim().max(120).optional(),
      description: z.string().trim().max(500).optional(),
      /** Datumsleutel YYYY-MM-DD; wordt afgerond naar de maandag van die week. */
      startDate: z.string().refine(isDateKey, 'Ongeldige startdatum'),
      endDate: z.string().refine(isDateKey, 'Ongeldige einddatum').nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'COACH' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen een coach maakt een groep aan' })
      }
      const startKey = mondayKeyOf(amsMidnight(input.startDate))
      if (input.endDate && input.endDate < startKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'De einddatum ligt vóór de startdatum' })
      }
      const id = createId()
      await ctx.prisma.athleteGroup.create({
        data: {
          id,
          name: input.name,
          planName: input.planName || null,
          description: input.description || null,
          ownerId: ctx.user.id,
          startDate: amsMidnight(startKey),
          endDate: input.endDate ? amsMidnight(input.endDate) : null,
          staff: { create: { id: createId(), userId: ctx.user.id, role: 'OWNER' } },
        },
      })
      return { id }
    }),

  update: coachStaffProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(80).optional(),
      planName: z.string().trim().max(120).nullable().optional(),
      description: z.string().trim().max(500).nullable().optional(),
      startDate: z.string().refine(isDateKey, 'Ongeldige startdatum').optional(),
      endDate: z.string().refine(isDateKey, 'Ongeldige einddatum').nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.id, 'MANAGER')
      const { id, startDate, endDate, ...rest } = input
      await ctx.prisma.athleteGroup.update({
        where: { id },
        data: {
          ...rest,
          ...(startDate ? { startDate: amsMidnight(mondayKeyOf(amsMidnight(startDate))) } : {}),
          ...(endDate !== undefined ? { endDate: endDate ? amsMidnight(endDate) : null } : {}),
        },
      })
      return { ok: true }
    }),

  delete: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.id, 'OWNER')
      // Kopieën bij de leden houden hun rij: de FK op items staat op SET NULL,
      // de groepskalender zelf cascadeert mee.
      await ctx.prisma.athleteGroup.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  addMembers: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientIds: z.array(z.string()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      for (const pid of input.patientIds) await assertLidKoppeling(ctx.prisma, ctx.user, pid)
      const bestaand = await ctx.prisma.athleteGroupMember.findMany({ where: { groupId: input.groupId }, select: { patientId: true } })
      const al = new Set(bestaand.map(b => b.patientId))
      const nieuw = input.patientIds.filter(p => !al.has(p))
      await ctx.prisma.athleteGroupMember.createMany({
        data: nieuw.map(patientId => ({ id: createId(), groupId: input.groupId, patientId })),
      })
      return { added: nieuw.length }
    }),

  removeMember: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      await ctx.prisma.$transaction([
        ctx.prisma.athleteGroupMember.deleteMany({ where: { groupId: input.groupId, patientId: input.patientId } }),
        // Zijn trainingen blijven, alleen de verwijzing naar de groep vervalt.
        ctx.prisma.weekScheduleDayItem.updateMany({
          where: { groupId: input.groupId, day: { weekSchedule: { patientId: input.patientId } } },
          data: { groupId: null, sourceItemId: null },
        }),
      ])
      return { ok: true }
    }),

  setMemberNote: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientId: z.string(), note: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
      await ctx.prisma.athleteGroupMember.update({
        where: { groupId_patientId: { groupId: input.groupId, patientId: input.patientId } },
        data: { note: input.note || null },
      })
      return { ok: true }
    }),

  addStaff: coachStaffProcedure
    .input(z.object({ groupId: z.string(), email: z.string().trim().email(), role: rolEnum }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      const user = await ctx.prisma.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' }, role: { in: ['THERAPIST', 'COACH'] } },
        select: { id: true },
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen therapeut of coach met dit e-mailadres' })
      await ctx.prisma.athleteGroupStaff.upsert({
        where: { groupId_userId: { groupId: input.groupId, userId: user.id } },
        create: { id: createId(), groupId: input.groupId, userId: user.id, role: input.role },
        update: { role: input.role },
      })
      return { ok: true }
    }),

  setStaffRole: coachStaffProcedure
    .input(z.object({ groupId: z.string(), userId: z.string(), role: rolEnum }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      if (input.userId === g.ownerId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'De eigenaar houdt altijd de eigenaarsrol' })
      await ctx.prisma.athleteGroupStaff.update({
        where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
        data: { role: input.role },
      })
      return { ok: true }
    }),

  removeStaff: coachStaffProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      if (input.userId === g.ownerId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'De eigenaar kan zichzelf niet verwijderen' })
      await ctx.prisma.athleteGroupStaff.deleteMany({ where: { groupId: input.groupId, userId: input.userId } })
      return { ok: true }
    }),

  /** Weken van de groepskalender voor het verzendvenster. */
  weeks: coachStaffProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
      const weken = await ctx.prisma.weekSchedule.findMany({
        where: { groupId: input.groupId, startDate: { not: null } },
        select: { id: true, weekNumber: true, startDate: true, days: { select: { _count: { select: { items: true } } } } },
        orderBy: { startDate: 'asc' },
      })
      return weken.map(w => ({
        id: w.id,
        weekNumber: w.weekNumber,
        monday: mondayKeyOf(w.startDate!),
        itemCount: w.days.reduce((n, d) => n + d._count.items, 0),
      }))
    }),

  /**
   * Stuur naar iedereen: per lid en per gekozen week de groepsitems vervangen
   * (zie lib/group-send.ts voor de regels). Eén transactie per lid, daarna
   * één push per lid. Overgeslagen leden (uitbehandeld) komen terug in het
   * resultaat, ze blijven gewoon lid.
   */
  send: coachStaffProcedure
    .input(z.object({
      groupId: z.string(),
      weekIds: z.array(z.string()).min(1).max(104),
      memberIds: z.array(z.string()).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      const groep = await ctx.prisma.athleteGroup.findUniqueOrThrow({ where: { id: g.id }, select: { name: true, planName: true } })
      const leden = await ctx.prisma.athleteGroupMember.findMany({
        where: { groupId: g.id, patientId: { in: input.memberIds } },
        select: { patientId: true, patient: { select: { name: true, email: true } } },
      })
      const bronWeken = await ctx.prisma.weekSchedule.findMany({
        where: { id: { in: input.weekIds }, groupId: g.id, startDate: { not: null } },
        include: {
          days: {
            include: { items: { include: COPY_ITEM_INCLUDE, orderBy: { order: 'asc' } } },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
        orderBy: { startDate: 'asc' },
      })
      if (bronWeken.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kies minstens één week van de groep' })
      const groepsWeken: GroepsWeek[] = bronWeken.map(w => ({
        id: w.id, monday: mondayKeyOf(w.startDate!),
        days: w.days.map(d => ({ dayOfWeek: d.dayOfWeek, items: d.items.map(it => ({ id: it.id })) })),
      }))
      const bronItem = new Map(bronWeken.flatMap(w => w.days.flatMap(d => d.items.map(it => [it.id, it] as const))))
      const vandaag = dateKey(new Date())

      // Zelfde scope als planTemplates.applyToPatient: eigen weken of praktijk.
      const isAdmin = ctx.user.role === 'ADMIN'
      const scope = isAdmin ? {} : { OR: [{ creatorId: ctx.user.id }, ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : [])] }

      const overgeslagen: string[] = []
      let trainingen = 0
      let verzondenLeden = 0

      for (const lid of leden) {
        const label = lid.patient.name ?? lid.patient.email
        try {
          await assertNotDischarged(ctx.prisma, ctx.user, lid.patientId)
        } catch {
          overgeslagen.push(label)
          continue
        }
        const lidWekenRaw = await ctx.prisma.weekSchedule.findMany({
          where: { patientId: lid.patientId, isTemplate: false, ...scope },
          select: {
            id: true, weekNumber: true, startDate: true,
            days: { select: { id: true, dayOfWeek: true, items: { select: { id: true, groupId: true, _count: { select: { sessionLogs: true, cardioLogs: true } } } } } },
          },
        })
        const lidWeken: LidWeek[] = lidWekenRaw
          .filter(w => w.startDate)
          .map(w => ({
            id: w.id, monday: mondayKeyOf(w.startDate!),
            items: w.days.flatMap(d => d.items.map(it => ({ id: it.id, dayOfWeek: d.dayOfWeek, groupId: it.groupId, gelogd: it._count.sessionLogs + it._count.cardioLogs > 0 }))),
          }))
        let maxWeekNumber = lidWekenRaw.reduce((m, w) => Math.max(m, w.weekNumber), 0)
        const stappen = planVerzending({ groupId: g.id, groepsWeken, lidWeken, vandaag })

        await ctx.prisma.$transaction(async tx => {
          for (const stap of stappen) {
            let weekId = stap.lidWeekId
            if (!weekId) {
              weekId = createId()
              maxWeekNumber++
              await tx.weekSchedule.create({
                data: {
                  id: weekId,
                  name: `${groep.planName ?? groep.name} · week van ${stap.monday}`,
                  creatorId: ctx.user.id,
                  practiceId: ctx.user.practiceId ?? null,
                  patientId: lid.patientId,
                  isTemplate: false,
                  weekNumber: maxWeekNumber,
                  startDate: amsMidnight(stap.monday),
                  endDate: amsMidnight(addDaysKey(stap.monday, 6)),
                  days: { create: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({ id: createId(), dayOfWeek })) },
                },
              })
            }
            if (stap.verwijderen.length) {
              await tx.weekScheduleDayItem.deleteMany({ where: { id: { in: stap.verwijderen } } })
            }
            const dagen = await tx.weekScheduleDay.findMany({ where: { weekScheduleId: weekId }, select: { id: true, dayOfWeek: true } })
            const dagId = new Map(dagen.map(d => [d.dayOfWeek, d.id]))
            for (const k of stap.kopieren) {
              let dayId = dagId.get(k.dayOfWeek)
              if (!dayId) {
                dayId = createId()
                await tx.weekScheduleDay.create({ data: { id: dayId, weekScheduleId: weekId, dayOfWeek: k.dayOfWeek } })
                dagId.set(k.dayOfWeek, dayId)
              }
              const laatste = await tx.weekScheduleDayItem.findFirst({ where: { dayId }, orderBy: { order: 'desc' }, select: { order: true } })
              const bron = bronItem.get(k.bronItemId)!
              await copyItemToDay(tx, bron, dayId, laatste ? laatste.order + 1 : 0)
              // Herkomst op de zojuist gemaakte kopie (copyItemToDay kent geen groepen).
              const kopie = await tx.weekScheduleDayItem.findFirst({ where: { dayId }, orderBy: { order: 'desc' }, select: { id: true } })
              if (kopie) await tx.weekScheduleDayItem.update({ where: { id: kopie.id }, data: { groupId: g.id, sourceItemId: k.bronItemId } })
              trainingen++
            }
          }
          await tx.athleteGroupMember.update({
            where: { groupId_patientId: { groupId: g.id, patientId: lid.patientId } },
            data: { lastSentAt: new Date() },
          })
        }, { timeout: 60_000 })
        verzondenLeden++
        await notifyNewSchedule(lid.patientId).catch(() => {})
      }

      await ctx.prisma.athleteGroup.update({ where: { id: g.id }, data: { lastSentAt: new Date() } })
      return { members: verzondenLeden, weeks: groepsWeken.length, items: trainingen, skipped: overgeslagen }
    }),
})
```

- [ ] **Step 2: Registreren in `_app.ts`**

```ts
import { athleteGroupsRouter } from './athleteGroups'
// …
  athleteGroups: athleteGroupsRouter,
```

- [ ] **Step 3: Meldingen vertalen** in `error-messages.ts` (zelfde kop `// Atletengroepen`):

```ts
  'Geen actieve koppeling met deze atleet': 'No active link with this athlete',
  'Alleen een coach maakt een groep aan': 'Only a coach can create a group',
  'De einddatum ligt vóór de startdatum': 'The end date is before the start date',
  'Geen therapeut of coach met dit e-mailadres': 'No therapist or coach with this email address',
  'De eigenaar houdt altijd de eigenaarsrol': 'The owner always keeps the owner role',
  'De eigenaar kan zichzelf niet verwijderen': 'The owner cannot remove themselves',
  'Kies minstens één week van de groep': 'Choose at least one week of the group',
  'Ongeldige startdatum': 'Invalid start date',
  'Ongeldige einddatum': 'Invalid end date',
```

- [ ] **Step 4: Type-check en tests** — `npx tsc --noEmit && npx vitest run src/server` → geen fouten, alles groen. Let op: `copyItemToDay` verwacht `Pick<PrismaClient, 'weekScheduleDayItem'>`; de transactie-client voldoet daaraan.

- [ ] **Step 5: Commit** — `git add src/server/routers/athleteGroups.ts src/server/routers/_app.ts src/server/i18n/error-messages.ts && git commit -m "feat(groepen): router voor groepen, leden, staf en verzenden" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 5: Groepskalender in `weekSchedules` (aanmaken, lezen, bewerkrechten)

**Files:**
- Modify: `src/server/routers/weekSchedules.ts` (`create` ~regel 380, `listWithItems` ~regel 1225, guard `assertPatientLink` ~regel 35 en `assertMagWeekBewerken` ~regel 173)
- Modify: `src/server/routers/planTemplates.ts` (`applyToPatient`, stand "vervangen", ~regel 549)

**Interfaces:**
- Consumes: `assertGroupRole` (Task 2).
- Produces: `weekSchedules.create` accepteert `groupId?: string`; `weekSchedules.listWithItems` accepteert `groupId?: string`; nieuwe interne guard `assertMagKalenderBewerken(prisma, user, { patientId, groupId })`.

- [ ] **Step 1: Guard voor groepskalenders**

Voeg onder `assertPatientLink` toe:

```ts
/**
 * Eén ingang voor "mag ik deze kalender bewerken?": een groepskalender loopt
 * langs de groepsrol (minimaal PLANNER), een atletenkalender langs de
 * patiëntkoppeling. `assertPatientLink(null)` gaf altijd al door (sjablonen),
 * dus zonder deze tak kon elke staf een groepskalender op id bewerken.
 */
async function assertMagKalenderBewerken(
  prisma: PrismaClient,
  user: WeekUser,
  kalender: { patientId: string | null | undefined; groupId?: string | null },
) {
  if (kalender.groupId) {
    await assertGroupRole(prisma, user, kalender.groupId, 'PLANNER')
    return
  }
  await assertPatientLink(prisma, user, kalender.patientId)
}
```
Import bovenin: `import { assertGroupRole } from '@/server/lib/group-access'`.

Pas `assertMagWeekBewerken` aan: parameter `week: { creatorId: string; isTemplate: boolean; patientId: string | null; groupId?: string | null }` en de laatste regel wordt `await assertMagKalenderBewerken(prisma, user, week)`.

Loop nu alle aanroepen langs:

```bash
grep -n 'assertPatientLink(' src/server/routers/weekSchedules.ts
grep -n 'assertMagWeekBewerken(' src/server/routers/weekSchedules.ts
```
Voor elke aanroep die een `patientId` doorgeeft dat uit een geladen week/dag/item komt (patroon `x.weekSchedule.patientId`, `week.patientId`, `dag.weekSchedule.patientId`): breid de `select`/`include` van die query uit met `groupId: true` naast `patientId: true`, en vervang de aanroep door `assertMagKalenderBewerken(ctx.prisma, ctx.user, { patientId: <zelfde bron>.patientId, groupId: <zelfde bron>.groupId })`. Aanroepen met een `patientId` uit de input (bijv. `create`, `list`) blijven staan. Voorbeeld:

```ts
// vóór
const dag = await ctx.prisma.weekScheduleDay.findUnique({ where: { id: input.dayId }, include: { weekSchedule: { select: { creatorId: true, isTemplate: true, patientId: true } } } })
await assertPatientLink(ctx.prisma, ctx.user, dag.weekSchedule.patientId)
// na
const dag = await ctx.prisma.weekScheduleDay.findUnique({ where: { id: input.dayId }, include: { weekSchedule: { select: { creatorId: true, isTemplate: true, patientId: true, groupId: true } } } })
await assertMagKalenderBewerken(ctx.prisma, ctx.user, dag.weekSchedule)
```

- [ ] **Step 2: `create` met `groupId`**

Input: `groupId: z.string().optional(),`. In de mutation, direct na `const { patientId, days, startDate, endDate, ...rest } = input` → wordt `const { patientId, groupId, days, startDate, endDate, ...rest } = input`, en vóór `await assertPatientLink(…)`:

```ts
      if (groupId) {
        await assertGroupRole(ctx.prisma, ctx.user, groupId, 'PLANNER')
        // Idempotent per (groep, maandag), zoals hieronder per (patiënt, maandag).
        if (startDate) {
          const monday = mondayKeyOf(new Date(startDate))
          const bestaande = await ctx.prisma.weekSchedule.findMany({
            where: { groupId, startDate: { not: null } },
            include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
            orderBy: { createdAt: 'asc' },
          })
          const match = bestaande.find(w => w.startDate && mondayKeyOf(w.startDate) === monday)
          if (match) return match
        }
      }
```
In de `create`-data: `...(groupId ? { groupId } : {}),` naast `...(patientId ? { patientId } : {})`.

- [ ] **Step 3: `listWithItems` met `groupId`**

Input: `groupId: z.string().optional(),`. In de query, vóór `return ctx.prisma.weekSchedule.findMany`:

```ts
      if (input?.groupId) await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
```
en in de `where`: vervang `...ownership,` door `...(input?.groupId ? {} : ownership),` en voeg toe `...(input?.groupId ? { groupId: input.groupId } : {}),`. Staf van een groep is niet altijd de maker van de weken; de groepsrol is daar de toegang.

- [ ] **Step 4: Plan toepassen laat groepstrainingen staan**

In `planTemplates.applyToPatient`, stand `replace`, vervang

```ts
              await tx.weekScheduleDay.deleteMany({ where: { weekScheduleId: targetId } })
```
door

```ts
              // Alleen eigen items weg; trainingen die een groep hier neerzette
              // blijven staan (spec atletengroepen: beide richtingen raken elkaar niet).
              await tx.weekScheduleDayItem.deleteMany({ where: { day: { weekScheduleId: targetId }, groupId: null } })
```
De dagen blijven dus bestaan; de bestaande "dagen hergebruiken"-logica eronder werkt daarmee.

- [ ] **Step 5: Type-check en tests** — `npx tsc --noEmit && npx vitest run src/server src/lib` → groen.

- [ ] **Step 6: Commit** — `git add src/server/routers/weekSchedules.ts src/server/routers/planTemplates.ts && git commit -m "feat(groepen): groepskalender in weekSchedules, bewerkrechten via groepsrol, plan toepassen spaart groepstrainingen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 6: Programmanaam naar de atleet (`patient.ts` en atleetagenda)

**Files:**
- Modify: `src/server/routers/patient.ts` (`calendarRange` items ~regel 2300 en 2353; `getTodayExercises` WORKOUT-tak `plannedItem` ~regel 549)
- Modify: `src/app/(athlete)/athlete/schedule/page.tsx` (detail van een event)

**Interfaces:**
- Produces: op elk kalenderitem `groupPlanName: string | null`; op `plannedItem` in `getTodayExercises` `groupPlanName: string | null`.

- [ ] **Step 1: Server**

In `calendarRange`, waar de items van `schedules` geselecteerd worden (de query met `_count: { select: { exercises: … } }` en `cardioParams: true`), voeg aan de item-`select`/`include` toe: `group: { select: { name: true, planName: true } }`. In de mapping (`items: d.items.map(({ cardioParams, ...it }) => ({ …`) wordt het:

```ts
            items: d.items.map(({ cardioParams, group, ...it }) => ({
              ...it,
              groupPlanName: group ? (group.planName ?? group.name) : null,
              hasContent:
                it._count.exercises > 0 || it.programId !== null || cardioParams != null,
            })),
```
In `getTodayExercises` (WORKOUT-tak) laadt het item al zijn velden; voeg aan de `include` van dat item `group: { select: { name: true, planName: true } }` toe en in `plannedItem`: `groupPlanName: item.group ? (item.group.planName ?? item.group.name) : null,`.

- [ ] **Step 2: Atleetagenda**

In `src/app/(athlete)/athlete/schedule/page.tsx` heeft elk event een bron-item; zoek waar de eventnaam in het detailpaneel staat (de `<p className="truncate"` onder de icoon-div rond regel 763) en zet eronder:

```tsx
{event.groupPlanName && (
  <p className="athletic-mono" style={{ fontSize: 9, color: P.inkMuted, letterSpacing: '0.08em' }}>
    ONDERDEEL VAN {event.groupPlanName.toUpperCase()}
  </p>
)}
```
Het event-type (`type SchedEvent` of hoe het daar heet) krijgt `groupPlanName: string | null` en de plek waar events uit `schedules[].days[].items[]` gebouwd worden geeft `groupPlanName: it.groupPlanName ?? null` door.

- [ ] **Step 3: Type-check** — `npx tsc --noEmit`. Als `mySchedule` of een andere union over TS2589 struikelt: dat komt niet door deze scalars; controleer dan of je per ongeluk `group` zonder `select` hebt ge-include'd.

- [ ] **Step 4: Commit** — `git add src/server/routers/patient.ts 'src/app/(athlete)/athlete/schedule/page.tsx' && git commit -m "feat(groepen): atleet ziet van welk programma een verzonden training is" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 7: Verzendvenster (`GroupSendDialog`)

**Files:**
- Create: `src/components/week-planner/GroupSendDialog.tsx`

**Interfaces:**
- Consumes: `trpc.athleteGroups.weeks`, `trpc.athleteGroups.get`, `trpc.athleteGroups.send` (Task 4); dark-ui: `DarkDialog`, `DarkDialogContent`, `DarkDialogHeader`, `DarkDialogTitle`, `DarkButton`, `MetaLabel`, `P`; `OptionSwitch` uit `@/components/week-planner/block-forms/fields`.
- Produces: `export function GroupSendDialog({ groupId, open, onClose }: { groupId: string; open: boolean; onClose: () => void })`.

- [ ] **Step 1: Component**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle, DarkButton, MetaLabel, P } from '@/components/dark-ui'
import { OptionSwitch } from '@/components/week-planner/block-forms/fields'
import { dateKey, mondayKeyOf } from '@/lib/week-dates'

/**
 * "Stuur naar iedereen": kies weken (standaard vanaf de huidige week) en leden
 * (standaard iedereen), zie wat er gaat gebeuren, verstuur. De server bepaalt
 * wat er per lid vervangen wordt; zie lib/group-send.ts.
 */
export function GroupSendDialog({ groupId, open, onClose }: { groupId: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils()
  const { data: weken = [] } = trpc.athleteGroups.weeks.useQuery({ groupId }, { enabled: open })
  const { data: groep } = trpc.athleteGroups.get.useQuery({ id: groupId }, { enabled: open })
  const send = trpc.athleteGroups.send.useMutation()

  const dezeMaandag = mondayKeyOf(new Date())
  const [weekIds, setWeekIds] = useState<Set<string>>(new Set())
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [oudeWekenOpen, setOudeWekenOpen] = useState(false)

  // Standaardkeuze zodra de data er is: weken vanaf nu, alle leden.
  useEffect(() => {
    if (!open) return
    setWeekIds(new Set(weken.filter(w => w.monday >= dezeMaandag).map(w => w.id)))
  }, [open, weken, dezeMaandag])
  useEffect(() => {
    if (!open || !groep) return
    setMemberIds(new Set(groep.members.map(m => m.patientId)))
  }, [open, groep])

  const gekozenWeken = weken.filter(w => weekIds.has(w.id))
  const trainingen = gekozenWeken.reduce((n, w) => n + w.itemCount, 0)
  const oudeWeken = useMemo(() => weken.filter(w => w.monday < dezeMaandag), [weken, dezeMaandag])
  const nieuweWeken = useMemo(() => weken.filter(w => w.monday >= dezeMaandag), [weken, dezeMaandag])

  const wissel = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n }

  async function verstuur() {
    try {
      const r = await send.mutateAsync({ groupId, weekIds: [...weekIds], memberIds: [...memberIds] })
      toast.success(`${r.items} trainingen naar ${r.members} atleten gestuurd (${r.weeks} weken)`)
      if (r.skipped.length) toast.warning(`Overgeslagen: ${r.skipped.join(', ')}`)
      await Promise.all([utils.athleteGroups.get.invalidate({ id: groupId }), utils.athleteGroups.list.invalidate()])
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Versturen mislukt')
    }
  }

  const WeekRij = ({ w }: { w: (typeof weken)[number] }) => (
    <label className="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" className="accent-[var(--p-brand)]" checked={weekIds.has(w.id)} onChange={() => setWeekIds(s => wissel(s, w.id))} />
      <span className="text-sm flex-1" style={{ color: P.ink }}>Week {w.weekNumber} · vanaf {w.monday}</span>
      <span className="athletic-mono" style={{ fontSize: 10, color: w.itemCount === 0 ? P.gold : P.inkMuted }}>
        {w.itemCount === 0 ? '0 TRAININGEN' : `${w.itemCount} TRAININGEN`}
      </span>
    </label>
  )

  return (
    <DarkDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DarkDialogContent aria-describedby={undefined} className="max-w-lg">
        <DarkDialogHeader><DarkDialogTitle>Stuur naar iedereen</DarkDialogTitle></DarkDialogHeader>
        <div className="space-y-4">
          <div>
            <MetaLabel>Weken</MetaLabel>
            {nieuweWeken.length === 0 && <p className="text-sm mt-1" style={{ color: P.inkMuted }}>Er staan nog geen weken vanaf vandaag in de groepskalender.</p>}
            {nieuweWeken.map(w => <WeekRij key={w.id} w={w} />)}
            {oudeWeken.length > 0 && (
              <div className="mt-2">
                <OptionSwitch checked={oudeWekenOpen} onCheckedChange={setOudeWekenOpen} label="Ook oudere weken tonen" hint="Dagen vóór vandaag blijven bij de atleet altijd staan." />
                {oudeWekenOpen && oudeWeken.map(w => <WeekRij key={w.id} w={w} />)}
              </div>
            )}
          </div>
          <div>
            <MetaLabel>Leden</MetaLabel>
            {(groep?.members ?? []).map(m => (
              <label key={m.patientId} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" className="accent-[var(--p-brand)]" checked={memberIds.has(m.patientId)} onChange={() => setMemberIds(s => wissel(s, m.patientId))} />
                <span className="text-sm flex-1" style={{ color: P.ink }}>{m.patient.name ?? m.patient.email}</span>
                {!m.lastSentAt && <span className="athletic-mono" style={{ fontSize: 10, color: P.brand }}>NOG NIETS ONTVANGEN</span>}
              </label>
            ))}
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(232,122,85,0.08)', border: '1px solid rgba(232,122,85,0.35)' }}>
            <p className="text-sm font-semibold" style={{ color: P.ink }}>
              {gekozenWeken.length} {gekozenWeken.length === 1 ? 'week' : 'weken'}, {memberIds.size} {memberIds.size === 1 ? 'atleet' : 'atleten'}, {trainingen * memberIds.size} trainingen
            </p>
            <p className="text-xs mt-1" style={{ color: P.inkMuted }}>
              In deze weken worden de trainingen van deze groep bij de gekozen atleten vervangen. Eigen trainingen, andere programma&apos;s, dagen vóór vandaag en gelogde sessies blijven staan.
            </p>
          </div>
          <div className="flex gap-2">
            <DarkButton variant="primary" className="flex-1" onClick={verstuur} disabled={send.isPending || weekIds.size === 0 || memberIds.size === 0}>
              {send.isPending ? 'Bezig met versturen' : 'Versturen'}
            </DarkButton>
            <DarkButton variant="ghost" onClick={onClose} disabled={send.isPending}>Annuleren</DarkButton>
          </div>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}
```
Controleer de exacte exportnamen van de dialoogcomponenten in `src/components/dark-ui/index.tsx` (`CardioWorkoutBuilder.tsx` importeert `DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogHeader, DarkDialogTitle`); `dateKey` is alleen nodig als je de vandaag-datum toont, laat de import anders weg.

- [ ] **Step 2: Type-check en lint** — `npx tsc --noEmit && npx eslint src/components/week-planner/GroupSendDialog.tsx`.

- [ ] **Step 3: Commit** — `git add src/components/week-planner/GroupSendDialog.tsx && git commit -m "feat(groepen): verzendvenster met weken, leden en samenvatting" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 8: Groepen in de weekplanner (kiezer, kalendereigenaar, knop)

**Files:**
- Modify: `src/app/(therapist)/therapist/week-planner/page.tsx` (`PatientPicker` regel ~191; state regel ~1820; `schedulesKey` ~1915; `ensureDayId` ~2718; kopregel met knoppen ~3236)

**Interfaces:**
- Consumes: `trpc.athleteGroups.list`; `weekSchedules.listWithItems({ groupId })` en `weekSchedules.create({ groupId })` (Task 5); `GroupSendDialog` (Task 7).

- [ ] **Step 1: Eigenaar van de kalender als één begrip**

Naast `selectedPatientId` komt een groepskeuze uit de URL: `groupId`. Voeg toe bij de URL-state:

```ts
  const [selectedGroupId, setSelectedGroupIdState] = useState(() => searchParams.get('groupId') || '')
```
en laat `setUrl` (de functie die `patientId`/`month` in de URL schrijft) ook `groupId` schrijven; kiezen van een groep leegt `patientId` en andersom. Definieer direct daaronder:

```ts
  /** Wiens kalender staat er: een atleet of een groep. Eén van beide, nooit allebei. */
  const eigenaar = selectedGroupId
    ? { soort: 'groep' as const, id: selectedGroupId }
    : selectedPatientId
      ? { soort: 'atleet' as const, id: selectedPatientId }
      : null
  const { data: groepen = [] } = trpc.athleteGroups.list.useQuery(undefined, { staleTime: 30_000 })
  const selectedGroup = groepen.find(g => g.id === selectedGroupId) ?? null
  const groepMagPlannen = !!selectedGroup && (selectedGroup.role === 'PLANNER' || selectedGroup.role === 'MANAGER' || selectedGroup.role === 'OWNER')
  const groepMagVerzenden = !!selectedGroup && (selectedGroup.role === 'MANAGER' || selectedGroup.role === 'OWNER')
```

- [ ] **Step 2: Queries op de eigenaar**

`schedulesKey` wordt:

```ts
  const schedulesKey = useMemo(
    () => (eigenaar?.soort === 'groep'
      ? { groupId: eigenaar.id, isTemplate: false, ...plannerWindow }
      : { patientId: selectedPatientId, isTemplate: false, ...plannerWindow }),
    [eigenaar, selectedPatientId, plannerWindow],
  )
```
en de `listWithItems`-query: `eigenaar ? schedulesKey : undefined, { enabled: !!eigenaar, … }`. De queries die sessies, belasting en gelogde data ophalen (`sessionsInRange`, `cardioInRange`, `listItemContents` blijft wel) krijgen `enabled: !!selectedPatientId` (dus uit bij een groep). Waar `planningVergrendeld` gebruikt wordt: bij een groep is de kalender vergrendeld als `!groepMagPlannen`:

```ts
  const planningVergrendeld = eigenaar?.soort === 'groep'
    ? !groepMagPlannen
    : patientGearchiveerd || (!!selectedPatientId && !selectedPatient)
```

In `ensureDayId`: `if (!eigenaar) return null` en de `ensureWeek.mutateAsync({ … })` krijgt `...(eigenaar.soort === 'groep' ? { groupId: eigenaar.id } : { patientId: eigenaar.id })` in plaats van `patientId: selectedPatientId`. In `openBlockDialog`: de melding `'Kies eerst een patiënt'` wordt `'Kies eerst een atleet of groep'` en test op `!eigenaar`. Het weekklembord (`setWeekClipboard`) en "Plan toepassen"/"Opslaan als plan" blijven alleen voor een atleet (`selectedPatientId`), dat is al zo door hun eigen checks.

De lege staat `{!selectedPatientId ? ( … kies een patiënt … ) : (` wordt `{!eigenaar ? (`.

- [ ] **Step 3: Kiezer en kop**

`PatientPicker` (regel ~191) krijgt twee extra props: `groups: { id: string; name: string; planName: string | null }[]` en `selectedGroupId: string | null`, en `onSelect` krijgt een tweede vorm: `onSelectGroup: (id: string | null) => void`. Boven de atletenlijst in het menu komt een kopje `Groepen` met per groep één rij (naam, eronder klein de programmanaam); kiezen roept `onSelectGroup(id)` aan. Als er geen groepen zijn, geen kopje. In de aanroep (regel ~3242):

```tsx
          <PatientPicker
            patients={patients}
            groups={groepen}
            selectedId={selectedPatientId || null}
            selectedGroupId={selectedGroupId || null}
            onSelect={(id) => setUrl({ patientId: id ?? '', groupId: '' })}
            onSelectGroup={(id) => setUrl({ groupId: id ?? '', patientId: '' })}
          />
```
Vóór de kiezer, in dezelfde knoppenrij, bij een groep:

```tsx
          {selectedGroup && (
            <span className="athletic-mono rounded px-2 py-1" style={{ fontSize: 10, background: 'rgba(232,122,85,0.12)', color: P.brand, border: '1px solid rgba(232,122,85,0.4)' }}>
              GROEP · {(selectedGroup.planName ?? selectedGroup.name).toUpperCase()}
            </span>
          )}
          {selectedGroup && groepMagVerzenden && (
            <DarkButton variant="primary" onClick={() => setSendOpen(true)} className="text-xs">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Stuur naar iedereen
            </DarkButton>
          )}
```
met `const [sendOpen, setSendOpen] = useState(false)` bij de andere dialoogstate, `Send` uit lucide-react in de import, en onderaan naast de andere dialogen:

```tsx
        {selectedGroup && sendOpen && (
          <GroupSendDialog groupId={selectedGroup.id} open onClose={() => setSendOpen(false)} />
        )}
```
Import: `import { GroupSendDialog } from '@/components/week-planner/GroupSendDialog'`.

- [ ] **Step 4: Dagcel bij een groep**

`DayCell`/`ItemTile` tonen sessiestatus, gelogde info en "gemist" op basis van `statusFor`/`loggedFor`; bij een groep bestaan die niet. Laat `statusFor` `'planned'` teruggeven en `loggedFor`/`sessionIdFor` `null` als `eigenaar?.soort === 'groep'` (zoek de plek waar die drie functies gedefinieerd zijn en zet de vroege return bovenaan). Niets anders in de cel verandert.

- [ ] **Step 5: Type-check, lint, kijken**

`npx tsc --noEmit && npx eslint 'src/app/(therapist)/therapist/week-planner/page.tsx'`. Start de dev-server (`preview_start` met naam `mbt-gym`), log in als therapeut/admin (Jurre logt zelf in), maak in het coachportaal een testgroep (Task 9 moet dan af zijn; anders via `athleteGroups.create` in een tsx-script) en controleer: kiezer toont de groep, kalender opent leeg, "+ Oefening" werkt, de knop "Stuur naar iedereen" staat er.

- [ ] **Step 6: Commit** — `git add 'src/app/(therapist)/therapist/week-planner/page.tsx' && git commit -m "feat(groepen): groepskalender in de weekplanner met kiezer, badge en verzendknop" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 9: Groepenpagina's (overzicht, aanmaken, leden en staf) en navigatie

**Files:**
- Create: `src/components/groups/GroupsOverview.tsx`, `src/components/groups/GroupDetail.tsx`
- Create: `src/app/(coach)/coach/groups/page.tsx`, `src/app/(coach)/coach/groups/[id]/page.tsx`, `src/app/(therapist)/therapist/groups/page.tsx`, `src/app/(therapist)/therapist/groups/[id]/page.tsx`
- Modify: `src/components/layout/TherapistSidebar.tsx` (beide navlijsten)

**Interfaces:**
- Consumes: `trpc.athleteGroups.*` (Task 4), `trpc.patients.list` (bestaand; velden `id`, `name`, `email`), `usePortal()` (`portal.base` is `/coach` of `/therapist`), `GroupSendDialog` (Task 7), dark-ui (`Kicker`, `Display`, `MetaLabel`, `Tile`, `DarkButton`, `DarkInput`, `SkeletonList`, `P`, `DarkDialog…`).

- [ ] **Step 1: Overzicht met aanmaakvenster**

`src/components/groups/GroupsOverview.tsx` volgt `src/app/(coach)/coach/plans/page.tsx` (kop met `Kicker`/`Display`/`MetaLabel`, zoekveld, `Tile`-grid). Per groep: naam, programmanaam, `memberCount` leden, `weekCount` weken, startdatum, "laatst verzonden" of "nog niet verzonden", rol-badge. Klik → `${portal.base}/groups/${id}`. Knop "Nieuwe groep" alleen als `me.role === 'COACH'` (`trpc.auth.getMe`). Het aanmaakvenster is een `DarkDialog` met velden naam (verplicht), programmanaam, startdatum (`<DarkInput type="date">`, standaard de maandag van deze week), einddatum (optioneel), omschrijving; opslaan roept `athleteGroups.create` aan, invalideert `list`, navigeert naar de detailpagina.

- [ ] **Step 2: Detail: leden en staf**

`src/components/groups/GroupDetail.tsx` met prop `groupId`. Kop: naam, programmanaam, periode, knoppen "Plannen" (`href=\`${portal.base}/week-planner?groupId=${id}\``), "Stuur naar iedereen" (`GroupSendDialog`, alleen bij rol MANAGER/OWNER), "Instellingen" (naam/programmanaam/periode bewerken, `athleteGroups.update`, alleen MANAGER/OWNER), "Verwijderen" (OWNER, bevestiging met ledenaantal, `athleteGroups.delete`, daarna terug naar het overzicht). Twee tabbladen: **Dashboard** (nu alleen de tekst "Het dashboard komt in deel 2." in een `Tile`) en **Leden en staf**:

- Leden: tabel met naam, toegevoegd op, laatst verzonden ("nog niets ontvangen" in `P.brand` als leeg), notitieveld (`DarkInput`, opslaan bij `onBlur` via `setMemberNote`), verwijderknop (MANAGER/OWNER). "Leden toevoegen" opent een `DarkDialog` met een zoekveld over `patients.list` (alleen wie nog geen lid is), vinkjes, knop "Toevoegen" → `addMembers`.
- Staf: rijen met naam, e-mail, rol als `<select>` met VIEWER/PLANNER/MANAGER (labels Meekijken / Meeplannen / Beheren; OWNER staat als "Eigenaar" en is niet te wijzigen), verwijderknop. "Therapeut toevoegen" (OWNER): e-mailveld + rolkeuze → `addStaff`.

Fouten uit de server als `toast.error(e.message)`.

- [ ] **Step 3: Routes en navigatie**

`src/app/(coach)/coach/groups/page.tsx`:

```tsx
'use client'
import { GroupsOverview } from '@/components/groups/GroupsOverview'
export default function Page() { return <GroupsOverview /> }
```
`src/app/(coach)/coach/groups/[id]/page.tsx`:

```tsx
'use client'
import { use } from 'react'
import { GroupDetail } from '@/components/groups/GroupDetail'
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <GroupDetail groupId={id} />
}
```
De therapeutvarianten re-exporteren: `export { default } from '@/app/(coach)/coach/groups/page'` en `export { default } from '@/app/(coach)/coach/groups/[id]/page'`.

In `TherapistSidebar.tsx`: in de therapeutlijst na `Trainingsplannen`: `{ href: '/therapist/groups', label: 'Groepen', icon: UsersRound },` en in de coachlijst na `Trainingsplannen`: `{ href: '/coach/groups', label: 'Groepen', icon: UsersRound },` (`UsersRound` uit lucide-react toevoegen aan de import).

- [ ] **Step 4: Type-check, lint, kijken** — `npx tsc --noEmit && npx eslint src/components/groups src/components/layout/TherapistSidebar.tsx`. In de browser (ingelogd): groep aanmaken, "Jurre test" als lid toevoegen, notitie opslaan, naar "Plannen" springen.

- [ ] **Step 5: Commit** — `git add src/components/groups 'src/app/(coach)/coach/groups' 'src/app/(therapist)/therapist/groups' src/components/layout/TherapistSidebar.tsx && git commit -m "feat(groepen): groepenoverzicht, aanmaken, leden en staf, menupunt in beide portalen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 10: Keten doorlopen, documentatie, opleveren

**Files:**
- Modify: `AGENTS.md` (sectie na de bloklijst-sectie)
- Modify: `/Users/eva/.claude/projects/-Users-eva/memory/reference_mbt_planner_item_content.md` en `MEMORY.md` (na oplevering)

- [ ] **Step 1: Keten met de testatleet**

Met de dev-server en ingelogde therapeut/coach: (1) groep "Testgroep" met programmanaam "Test periodisering", startdatum deze maandag, lid "Jurre test"; (2) in de planner op de groep twee trainingen in de huidige week (vandaag of later) en één volgende week; (3) "Stuur naar iedereen" → toast "3 trainingen naar 1 atleten gestuurd (2 weken)"; (4) kies "Jurre test" in de kiezer: de trainingen staan er, het zijpaneel toont de oefeningen; (5) pas bij Jurre test één training aan (oefening toevoegen), verstuur opnieuw alleen de volgende week: de aangepaste training in deze week blijft, de volgende week is vervangen; (6) atleetkant zonder login controleren via een tsx-script dat `prisma.weekScheduleDayItem.findMany({ where: { groupId }, include: { group: true } })` toont en via `curl` op de dev-server niet mogelijk is; het label "Onderdeel van" is dan geverifieerd via de `calendarRange`-mapping in Task 6 (type-check) en één handmatige controle zodra Jurre als atleet kijkt. (7) Opruimen: groep verwijderen (kopieën blijven, verwijzing leeg) en de testtrainingen bij Jurre test weghalen.

- [ ] **Step 2: AGENTS.md**

Voeg na de sectie over cardio in de pop-up toe:

```markdown
# Atletengroepen: de groepskalender is een gewoon weekschema met `groupId`

Een atletengroep (`athlete_groups`) heeft leden, staf met een rol
(`lib/group-access.ts`, tabel in de spec) en een kalender van `week_schedules`
met `groupId` gevuld en `patientId` leeg. Daardoor werkt de hele planner erop.
"Stuur naar iedereen" (`athleteGroups.send`) vervangt per lid en per gekozen
week alleen items met deze `groupId`; de regels staan als pure functie in
`lib/group-send.ts` en de kopie draagt `groupId` + `sourceItemId`. Andersom
laat `planTemplates.applyToPatient` in de stand "vervangen" items mét `groupId`
staan. Bewerkrechten op een kalender lopen via `assertMagKalenderBewerken` in
`weekSchedules.ts`: groepskalender → groepsrol PLANNER, atleet → patiëntkoppeling.
```

- [ ] **Step 3: Volledige checks en commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/server/routers/athleteGroups.ts src/server/lib/group-access.ts src/server/lib/group-send.ts src/components/groups src/components/week-planner/GroupSendDialog.tsx
git add AGENTS.md && git commit -m "docs(groepen): hoe de groepskalender en het verzenden in elkaar zitten" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Deploy en merge naar main pas na Jurre's akkoord op de keten (zie de deploy-regels in het geheugen: `vercel --prod --yes` vanuit `/Users/eva/mbt-gym`, main fast-forwarden via de worktree `~/mbt-gym-parity`).
