-- Rehab-trajecten, fase C1: alles wat de oude code nog overleeft.
--
-- Fase C was oorspronkelijk één bestand dat ook meteen
-- rehab_criterion_status."patientId" dropte. Dat kan niet in één stap: na die
-- DROP draait er nog productiecode waarvan de Prisma-client "patientId" op
-- RehabCriterionStatus kent. Prisma zet bij een findMany zonder select ALLE
-- modelkolommen in de SELECT-lijst, dus src/lib/rehab-data.ts valt dan om op
-- een kolom die niet meer bestaat. Dat sloopt de complete gedeelde leeslaag:
-- rehab.getPatientTracker, rehab.getMyTracker, rehab.getTraject, de patiënt-
-- en atleet-dashboards, beide PDF-ingangen en iOS build 78. De upsert in
-- src/server/routers/rehab.ts schrijft "patientId" bovendien expliciet mee,
-- dus ook schrijven valt om.
--
-- Daarom staat de echte contract-stap apart in
-- 20260803_rehab_episodes_c2.sql. Dit bestand doet alles wat vóór die tweede
-- deploy kan: na C1 kan de oude code nog steeds lezen en schrijven, want de
-- kolom bestaat nog en is nu nullable.
--
-- Volgorde in de uitrol:
--   migratie A, migratie B, deploy 1 (tussenfase-code),
--   migratie C1, deploy 2 (schema opgeschoond), migratie C2.
--
-- Volgorde binnen dit bestand is dwingend, niet cosmetisch:
--   1. De vier policies (rehab_status_select/insert/update/delete_therapist)
--      bevatten allemaal is_therapist_of("patientId") en zijn daarmee een
--      pg_depend-afhankelijkheid van die kolom. De DROP COLUMN in C2 faalt
--      zolang ze bestaan; met CASCADE zouden ze daar zonder waarschuwing
--      verdwijnen in plaats van hier expliciet en leesbaar gedropt te worden.
--   2. Daarna de twee patientId-indexes. De unique index
--      (patientId, criterionId) is ook het einde van venster 2 uit het plan:
--      zolang die staat botst "zelfde protocol opnieuw starten en het eerste
--      criterium aanvinken" op een 23505.
--   3. "patientId" nullable maken. De nieuwe code schrijft hem nog mee, dus
--      dit verandert vandaag niets, maar het maakt de deploy die hem uit het
--      Prisma-model haalt mogelijk zonder dat inserts falen op NOT NULL.
--   4. Daarna pas RLS en de REVOKE-blokken.
--
-- Terug te draaien, in tegenstelling tot C2: er verdwijnt geen data. De
-- policies en indexes staan letterlijk in de rollbacksectie van
-- docs/superpowers/specs/2026-07-31-rehab-episodes-migratie-sql.md.
--
-- Geen eigen BEGIN/COMMIT: prisma db execute stuurt dit bestand al als één
-- impliciete transactie. Geen CREATE INDEX CONCURRENTLY om dezelfde reden.

DROP POLICY IF EXISTS "rehab_status_select_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_insert_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_update_therapist" ON public.rehab_criterion_status;
DROP POLICY IF EXISTS "rehab_status_delete_therapist" ON public.rehab_criterion_status;

-- Het is een unique INDEX, geen constraint.
DROP INDEX IF EXISTS public."rehab_criterion_status_patientId_criterionId_key";
DROP INDEX IF EXISTS public."rehab_criterion_status_patientId_idx";

-- Nog niet droppen, alleen de NOT NULL eraf: de deploy hierna haalt de kolom
-- uit het Prisma-model, en vanaf dat moment schrijft geen enkele insert hem
-- nog mee. Zonder deze regel faalt elke create in dat venster.
ALTER TABLE public.rehab_criterion_status ALTER COLUMN "patientId" DROP NOT NULL;

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
