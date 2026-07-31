-- CRITICAL privilege-escalation fix (2026-07-31).
--
-- Vervolg op 20260728_lock_users_table_client_writes.sql. Die migratie sloot
-- `public.users`, maar liet de overige 158 public-tabellen open staan voor de
-- client-rollen. Daaronder `patient_therapists`, en daar zat het gat.
--
-- Probleem, geverifieerd tegen productie op 31 juli:
--
--   1. `authenticated` (elke ingelogde gebruiker, via de anon-key die in de
--      browserbundle zit) had INSERT op `public.patient_therapists`.
--   2. Policy `pt_insert_therapist` (20260420_enable_rls.sql:129) toetst alleen
--        WITH CHECK ("therapistId" = auth.uid()::text OR is_admin())
--      Geen rolcheck, en geen enkele beperking op WELKE `patientId` je invult.
--      De kolommen `isActive` en `status` hebben database-defaults `true` en
--      `APPROVED`, dus een minimale insert volstaat.
--   3. Een patiënt kon dus met
--        POST /rest/v1/patient_therapists
--        { "id": "...", "therapistId": "<eigen-id>", "patientId": "<slachtoffer>" }
--      zichzelf tot behandelaar promoveren. Daarna geeft `is_therapist_of()`
--      true, en dat ontsluit 18 tabellen met klinische data van dat slachtoffer
--      (rehab-trackers en criteriumstatussen, assessments, sessielogs,
--      cardiologs, wellness, insights, programma's, weekschema's), op vijf
--      daarvan ook schrijven, plus de volledige `users`-rij via `users_select`.
--
-- Fix: client-rollen mogen geen enkele public-tabel schrijven. De app schrijft
-- uitsluitend via Prisma (verbindt als `postgres`, tabel-eigenaar, BYPASSRLS).
-- Geverifieerd: er is geen enkele `.from('<tabel>')`-write in de web- of de
-- mobiele repo — alle `.from()`-aanroepen gaan naar Supabase Storage-buckets,
-- en er zijn geen Realtime-abonnementen (`postgres_changes`) die op deze
-- rechten leunen. De huidige grants staan geback-upt in
-- scripts/backups/grants-anon-authenticated-2026-07-31.json.
--
-- SELECT blijft staan: dat is read-only en wordt door RLS-policies afgedekt.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Nieuwe tabellen erven anders opnieuw schrijfrechten via de default privileges
-- die Supabase op het schema zet. Dit sluit dat gat structureel.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- Defense-in-depth: de schrijf-policies op patient_therapists zijn hiermee
-- onbereikbaar geworden. Weg ermee, zodat niemand ze later als "kennelijk
-- bedoeld" leest en de grants terugzet. De SELECT-policy is self-scoped
-- (eigen koppelingen) en blijft staan.
DROP POLICY IF EXISTS pt_insert_therapist ON public.patient_therapists;
DROP POLICY IF EXISTS pt_update_therapist ON public.patient_therapists;
DROP POLICY IF EXISTS pt_delete_therapist ON public.patient_therapists;
