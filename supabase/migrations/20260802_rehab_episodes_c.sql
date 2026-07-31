-- Rehab-trajecten, fase C: rehab_criterion_status verliest "patientId".
--
-- Na fase A en B is "trackerId" op rehab_criterion_status compleet en
-- verplicht; "patientId" is dan nog een ongebruikte legacy-kolom die enkel
-- blijft bestaan omdat de code hem nog meeschrijft (tussenfase-deploy, zie de
-- spec). Deze fase dropt "patientId" definitief en sluit de tabel af met
-- deny-all RLS, net als de overige patiëntdata-tabellen.
--
-- MAG UITSLUITEND NA de code-deploy draaien die rehab-data.ts en rehab.ts
-- omzet op trackerId (tussenfase in de spec). Draai je dit vóórdat die
-- deploy live staat, dan schrijft de lopende code nog steeds "patientId" mee
-- bij elke create en faalt dat vanaf dit moment op de ontbrekende kolom.
--
-- Volgorde binnen dit bestand is dwingend, niet cosmetisch:
--   1. De vier policies (rehab_status_select/insert/update/delete_therapist)
--      bevatten allemaal is_therapist_of("patientId") en zijn daarmee een
--      pg_depend-afhankelijkheid van die kolom. DROP COLUMN "patientId"
--      faalt zolang ze bestaan; met CASCADE zouden ze zonder waarschuwing
--      verdwijnen in plaats van hier expliciet en leesbaar gedropt te worden.
--   2. Pas daarna de twee patientId-indexes droppen en de kolom zelf.
--   3. Pas daarna RLS opnieuw aanzetten met de deny-all policy — zonder de
--      voorgaande DROP COLUMN zou dit een tabel afsluiten die nog een gat
--      via "patientId" openhoudt.
--
-- Eenrichtingsdeur: dit is GEEN additieve fase. Zodra dit bestand draait en
-- er is daarna ook maar één nieuw rehab-traject aangemaakt, kan de oude
-- unique index (patientId, criterionId) niet meer worden teruggezet zonder
-- data-verlies (zie rollback-sectie in
-- docs/superpowers/specs/2026-07-31-rehab-episodes-migratie-sql.md). Er is
-- geen staging-database: dit bestand draait rechtstreeks tegen productie.
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
