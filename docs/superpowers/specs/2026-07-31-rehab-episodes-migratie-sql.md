# Bijlage: migratie-SQL voor rehab-trajecten

Hoort bij [2026-07-31-patient-inactief-en-rehab-trajecten-design.md](2026-07-31-patient-inactief-en-rehab-trajecten-design.md), sectie 6.

Draaien met `npx prisma db execute --file <bestand>`. De URL komt uit `prisma.config.ts` en dat is `DIRECT_URL`, dus **rechtstreeks productie**. Er is geen dev- of staging-database.

`prisma db execute` stuurt het hele bestand als één impliciete transactie. Zet er dus geen eigen `BEGIN`/`COMMIT` in, en gebruik geen `CREATE INDEX CONCURRENTLY`.

## Gemeten uitgangssituatie (31 juli 2026, read-only)

| Meting | Waarde |
| --- | --- |
| `patient_rehab_trackers` | 2 rijen, 0 met `deactivatedAt` |
| `rehab_criterion_status` | 57 rijen |
| waarvan zonder bijbehorende tracker | 2 (patiënt `c329f19b-…` is hard verwijderd, beide `NOT_MET` zonder meetwaarde) |
| patiënten met twee open trackers | 0 |
| statusrijen naar een criterium buiten het protocol van hun tracker | 0 |
| `_prisma_migrations` | bestaat niet, `prisma migrate` wordt niet gebruikt |
| `current_user` | `postgres`, eigenaar, `BYPASSRLS` |
| `migrate diff` baseline | leeg |

Omdat `patientId` vandaag de primary key van de tracker is, is de backfill in fase B 1-op-1 deterministisch.

## Vooraf: backup

Verplicht vóór fase A. Volg het patroon van `scripts/merge-duplicate-weeks.ts`: dry-run als default, `--apply` als vlag, JSON naar `scripts/backups/`. Dump de vijf rehab-tabellen.

Maak **geen** archieftabel in `public`: `prisma db push` wil tabellen verwijderen die niet in het schema staan.

## Fase A, additief, terug te draaien

Bestand: `supabase/migrations/20260801_rehab_episodes_a.sql`

```sql
-- A1 enum voor de uitkomst
DO $$ BEGIN
  CREATE TYPE public."RehabTrajectOutcome" AS ENUM
    ('COMPLETED','DISCONTINUED','TRANSFERRED','RELAPSE','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- A2..A6 eigen primary key
ALTER TABLE public.patient_rehab_trackers ADD COLUMN IF NOT EXISTS "id" text;
UPDATE public.patient_rehab_trackers SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE public.patient_rehab_trackers ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE public.patient_rehab_trackers DROP CONSTRAINT "patient_rehab_trackers_pkey";
ALTER TABLE public.patient_rehab_trackers ADD CONSTRAINT "patient_rehab_trackers_pkey" PRIMARY KEY ("id");

-- A7 afsluitvelden. deactivatedAt blijft de ENIGE sluitings-marker;
-- closedById, outcome en outcomeNote zijn toelichting.
ALTER TABLE public.patient_rehab_trackers
  ADD COLUMN IF NOT EXISTS "closedById"  text,
  ADD COLUMN IF NOT EXISTS "outcome"     public."RehabTrajectOutcome",
  ADD COLUMN IF NOT EXISTS "outcomeNote" text;

-- A8 FK, naam en actie exact zoals Prisma ze verwacht
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_rehab_trackers_closedById_fkey') THEN
    ALTER TABLE public.patient_rehab_trackers
      ADD CONSTRAINT "patient_rehab_trackers_closedById_fkey"
      FOREIGN KEY ("closedById") REFERENCES public.users(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- A9 vervangt de index-dekking die de oude PK op patientId gaf. Geen DESC.
CREATE INDEX IF NOT EXISTS "patient_rehab_trackers_patientId_activatedAt_idx"
  ON public.patient_rehab_trackers ("patientId", "activatedAt");

-- A10 maximaal één lopend traject per patiënt.
-- Prisma kan dit niet uitdrukken en negeert het bij db push.
-- Precedent: users_one_owner_per_practice in 20260510_practice_profile.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "patient_rehab_trackers_one_open_per_patient"
  ON public.patient_rehab_trackers ("patientId") WHERE "deactivatedAt" IS NULL;
```

Controle achteraf, beide moeten `0` geven:

```sql
SELECT count(*) FROM public.patient_rehab_trackers WHERE "id" IS NULL;
SELECT count(*) FROM (
  SELECT "patientId" FROM public.patient_rehab_trackers
  WHERE "deactivatedAt" IS NULL GROUP BY 1 HAVING count(*) > 1
) x;
```

## Fase B, additief, terug te draaien

Draai dit **direct na fase A**. De backfill werkt alleen zolang `rehab_criterion_status."patientId"` nog gelijk is aan de oude PK-waarde van de tracker.

Exporteer eerst de wees-rijen naar `scripts/backups/rehab-criterion-status-orphans-<datum>.json` en bevestig dat het bestand er staat:

```sql
SELECT s.* FROM public.rehab_criterion_status s
LEFT JOIN public.patient_rehab_trackers t ON t."patientId" = s."patientId"
WHERE t."patientId" IS NULL;
```

Bestand: `supabase/migrations/20260801_rehab_episodes_b.sql`

```sql
ALTER TABLE public.rehab_criterion_status ADD COLUMN IF NOT EXISTS "trackerId" text;

UPDATE public.rehab_criterion_status s
SET "trackerId" = t."id"
FROM public.patient_rehab_trackers t
WHERE t."patientId" = s."patientId" AND s."trackerId" IS NULL;

-- Controle vóór de DELETE. Verwacht: 2.
-- SELECT count(*) FROM public.rehab_criterion_status WHERE "trackerId" IS NULL;

-- ALLEEN draaien nadat de JSON-backup bestaat.
DELETE FROM public.rehab_criterion_status WHERE "trackerId" IS NULL;

ALTER TABLE public.rehab_criterion_status ALTER COLUMN "trackerId" SET NOT NULL;

-- Dicht meteen het AVG-gat: statusrijen overleefden tot nu toe een verwijderde gebruiker.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rehab_criterion_status_trackerId_fkey') THEN
    ALTER TABLE public.rehab_criterion_status
      ADD CONSTRAINT "rehab_criterion_status_trackerId_fkey"
      FOREIGN KEY ("trackerId") REFERENCES public.patient_rehab_trackers("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "rehab_criterion_status_trackerId_criterionId_key"
  ON public.rehab_criterion_status ("trackerId", "criterionId");
CREATE INDEX IF NOT EXISTS "rehab_criterion_status_trackerId_idx"
  ON public.rehab_criterion_status ("trackerId");
```

## Tussenfase: code-deploy

Dit is de stap die het vaakst misgaat. In de tussenfase staan beide kolommen op `rehab_criterion_status` en is `patientId` nog `NOT NULL` zonder default. Het Prisma-model moet in deze fase dus **beide** velden bevatten en elke create moet ze allebei meeschrijven. Laat je `patientId` hier al weg, dan faalt elke insert.

Bij dezelfde deploy:

| Plek | Wijziging |
| --- | --- |
| `src/lib/rehab-data.ts:23` | `orderBy: { activatedAt: 'desc' }` toevoegen aan de findFirst |
| `src/lib/rehab-data.ts:43` | `where: { trackerId: tracker.id }` in plaats van `patientId` |
| `src/server/routers/rehab.ts:264` | fase-compleet-telling op `trackerId` |
| `src/server/routers/rehab.ts:113` | upsert wordt: zoek open traject, sluit of weiger, dan altijd een create |
| `src/server/routers/rehab.ts:140,166,203` | eerst het open traject opzoeken via `findFirst({ patientId, deactivatedAt: null })` |
| `src/server/routers/rehab.ts:223-256` | compound `trackerId_criterionId` |

De tRPC-inputs blijven `patientId` accepteren. `trackerId` mag er optioneel bij, met FORBIDDEN bij mismatch.

Let ook op `activateForPatient`: die doet nu een upsert die `deactivatedAt` op null zet en `protocolId`, `activatedById`, `activatedAt`, `surgeryDate` en `injuryDate` overschrijft zonder spoor. Na fase A gooit die upsert een `23505` op de partial unique index zodra er een open traject is. En `notes` is in zod `.optional()` en niet nullable, dus de notitie van het vorige traject blijft staan als de client `notes` weglaat.

En `adminDeleteProtocol` (`rehab.ts:371`) telt alle trackers inclusief gesloten. Met historie wordt een protocol daarmee de facto onverwijderbaar, en de foutmelding verwijst naar `deactivateForPatient`, wat dan iets anders betekent.

## Fase C, na de code-deploy, eenrichtingsdeur

Bestand: `supabase/migrations/20260802_rehab_episodes_c.sql`

De volgorde is dwingend. De vier policies bevatten `is_therapist_of("patientId")` en zijn daarmee een pg_depend-afhankelijkheid op die kolom: `DROP COLUMN` faalt zolang ze bestaan, en `CASCADE` sloopt ze stil.

```sql
DROP POLICY IF EXISTS "rehab_status_select_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_insert_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_update_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_delete_therapist" ON public.rehab_criterion_status;

-- Het is een unique INDEX, geen constraint.
DROP INDEX IF EXISTS public."rehab_criterion_status_patientId_criterionId_key";
DROP INDEX IF EXISTS public."rehab_criterion_status_patientId_idx";

ALTER TABLE public.rehab_criterion_status DROP COLUMN "patientId";

ALTER TABLE public.rehab_criterion_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.rehab_criterion_status;
CREATE POLICY "default_deny" ON public.rehab_criterion_status
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rehab_criterion_status FROM anon, authenticated;

-- De trackertabel houdt patientId, dus de select-policy blijft geldig.
-- De schrijf-policies zijn overbodig: geen enkele client schrijft rechtstreeks.
DROP POLICY IF EXISTS "rehab_tracker_insert_therapist" ON public.patient_rehab_trackers;
DROP POLICY IF EXISTS "rehab_tracker_update_therapist" ON public.patient_rehab_trackers;
DROP POLICY IF EXISTS "rehab_tracker_delete_therapist" ON public.patient_rehab_trackers;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.patient_rehab_trackers FROM anon, authenticated;
```

Wil je in plaats van deny-all een functionele leespolicy houden:

```sql
CREATE POLICY "rehab_status_select_therapist" ON public.rehab_criterion_status
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.patient_rehab_trackers t
  WHERE t."id" = "trackerId" AND (public.is_therapist_of(t."patientId") OR public.is_admin())
));
```

Dat heeft alleen zin als `is_therapist_of()` eerst wordt gerepareerd (sectie 4 van de spec). Zolang die functie alleen `isActive` checkt en `authenticated` INSERT-grants houdt op `patient_therapists`, is elke policy die erop leunt schijnzekerheid.

## Na afloop

```bash
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Moet `-- This is an empty migration.` teruggeven. De baseline is vandaag al leeg, dus elke afwijking is nieuw. Pas dan is `npm run db:push` gegarandeerd een no-op.

Drie checks toevoegen aan `scripts/check-migrations.ts` (patroon staat op regel 17-40): kolom `id` op de trackers, kolom `trackerId` op de statussen, en de afwezigheid van `patientId` daar.

## Rollback

Fase A en B zijn los van elkaar volledig terug te draaien. **Fase C plus het eerste nieuwe traject is een eenrichtingsdeur**: de oude unique index `(patientId, criterionId)` kan dan niet meer worden aangemaakt, en de PK op `patientId` kan niet terug.

```sql
-- Rollback C. Controleer eerst op duplicaten, anders faalt de unique index met 23505:
--   SELECT "patientId","criterionId", count(*) FROM public.rehab_criterion_status
--   GROUP BY 1,2 HAVING count(*) > 1;
ALTER TABLE public.rehab_criterion_status ADD COLUMN IF NOT EXISTS "patientId" text;
UPDATE public.rehab_criterion_status s SET "patientId" = t."patientId"
  FROM public.patient_rehab_trackers t WHERE t."id" = s."trackerId" AND s."patientId" IS NULL;
ALTER TABLE public.rehab_criterion_status ALTER COLUMN "patientId" SET NOT NULL;
CREATE UNIQUE INDEX "rehab_criterion_status_patientId_criterionId_key"
  ON public.rehab_criterion_status ("patientId", "criterionId");
CREATE INDEX "rehab_criterion_status_patientId_idx" ON public.rehab_criterion_status ("patientId");
-- plus de vier originele policies letterlijk terug uit 20260424_rehab_protocols.sql

-- Rollback B
DROP INDEX IF EXISTS public."rehab_criterion_status_trackerId_criterionId_key";
DROP INDEX IF EXISTS public."rehab_criterion_status_trackerId_idx";
ALTER TABLE public.rehab_criterion_status DROP CONSTRAINT IF EXISTS "rehab_criterion_status_trackerId_fkey";
ALTER TABLE public.rehab_criterion_status DROP COLUMN IF EXISTS "trackerId";

-- Rollback A. RA7 faalt zodra er een tweede traject per patiënt bestaat.
DROP INDEX IF EXISTS public."patient_rehab_trackers_one_open_per_patient";
DROP INDEX IF EXISTS public."patient_rehab_trackers_patientId_activatedAt_idx";
ALTER TABLE public.patient_rehab_trackers DROP CONSTRAINT IF EXISTS "patient_rehab_trackers_closedById_fkey";
ALTER TABLE public.patient_rehab_trackers
  DROP COLUMN IF EXISTS "closedById", DROP COLUMN IF EXISTS "outcome", DROP COLUMN IF EXISTS "outcomeNote";
ALTER TABLE public.patient_rehab_trackers DROP CONSTRAINT "patient_rehab_trackers_pkey";
ALTER TABLE public.patient_rehab_trackers ADD CONSTRAINT "patient_rehab_trackers_pkey" PRIMARY KEY ("patientId");
ALTER TABLE public.patient_rehab_trackers DROP COLUMN IF EXISTS "id";
DROP TYPE IF EXISTS public."RehabTrajectOutcome";
```

## Losse aandachtspunten

- `gen_random_uuid()::text` geeft uuid-tekst voor de twee bestaande trackers, terwijl Prisma daarna cuid's genereert. De kolom is `text`, dus functioneel onschadelijk, wel verwarrend in logs.
- De soft-delete-extension in `src/lib/prisma.ts:69-82` hangt alleen op model `user` en alleen op top-level reads. Een historie- of archieflijst via `prisma.patientRehabTracker.findMany({ include: { patient: true } })` filtert soft-deleted patiënten dus **niet** weg. Voeg `where: { patient: { deletedAt: null } }` expliciet toe.
- `patient_rehab_trackers.activatedById` en `rehab_criterion_status.updatedById` staan op `ON DELETE RESTRICT`. Daardoor kan een therapeut met rehab-historie vandaag al niet hard verwijderd worden, en faalt de gdpr-cleanup-cron daar stil per gebruiker. `scripts/delete-user.ts:78-86` reassignt zes relaties en deze twee staan er niet bij.
- Twee PDF-ingangen bouwen dezelfde payload in aparte code: `src/app/print/progress/[patientId]/route.ts:47,62,73` en `patients.getProgressPdfHtml:1894,1908,1919`. Wijzig je er één, dan lopen web- en app-rapport uiteen zonder dat iets faalt.
