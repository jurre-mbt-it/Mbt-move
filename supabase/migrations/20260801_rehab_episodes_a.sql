-- Rehab-trajecten, fase A: eigen primary key op patient_rehab_trackers.
--
-- Vandaag is "patientId" de primary key van patient_rehab_trackers, dus een
-- patiënt kan maar één rehab-traject ooit hebben (nooit een tweede, ook niet
-- na afsluiten). Deze fase maakt trajecten herhaalbaar: een eigen "id" als PK,
-- afsluitvelden (closedById/outcome/outcomeNote) naast de bestaande
-- deactivatedAt-marker, en een partial unique index die afdwingt dat een
-- patiënt maximaal één ÓPEN traject tegelijk heeft.
--
-- Additief en volledig terug te draaien (zie rollback-sectie in
-- docs/superpowers/specs/2026-07-31-rehab-episodes-migratie-sql.md): geen
-- kolom wordt gedropt, geen data gaat verloren. Bestaande rijen krijgen een
-- gegenereerde uuid als "id" (A2/A3); dat is functioneel prima, ook al
-- genereert Prisma daarna cuid's voor nieuwe rijen.
--
-- Volgorde: dit bestand moet vóór fase B draaien. Fase B backfilled
-- rehab_criterion_status."trackerId" door te joinen op de huidige PK-waarde
-- van de tracker (patientId). Zolang deze fase de PK nog niet heeft omgezet,
-- bestaat "id" niet en faalt fase B meteen.
--
-- Fase C is gesplitst. C1 mag pas na deploy 1, de code-deploy die beide
-- kolommen op rehab_criterion_status kent (zie tussenfase in de spec). C2
-- dropt "patientId" en mag pas na deploy 2, de deploy die die kolom uit het
-- Prisma-model haalt. Volledige volgorde: A, B, deploy 1, C1, deploy 2, C2.
--
-- Geen eigen BEGIN/COMMIT: prisma db execute stuurt dit bestand al als één
-- impliciete transactie. Geen CREATE INDEX CONCURRENTLY om dezelfde reden.

-- A1 enum voor de uitkomst
DO $$ BEGIN
  CREATE TYPE public."RehabTrajectOutcome" AS ENUM
    ('COMPLETED','DISCONTINUED','TRANSFERRED','RELAPSE','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- A2..A6 eigen primary key
ALTER TABLE public.patient_rehab_trackers ADD COLUMN IF NOT EXISTS "id" text;
UPDATE public.patient_rehab_trackers SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE public.patient_rehab_trackers ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE public.patient_rehab_trackers DROP CONSTRAINT IF EXISTS "patient_rehab_trackers_pkey";
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

-- Controle achteraf (handmatig te draaien, geen onderdeel van deze migratie).
-- Beide moeten 0 geven:
--
-- SELECT count(*) FROM public.patient_rehab_trackers WHERE "id" IS NULL;
-- SELECT count(*) FROM (
--   SELECT "patientId" FROM public.patient_rehab_trackers
--   WHERE "deactivatedAt" IS NULL GROUP BY 1 HAVING count(*) > 1
-- ) x;
