-- Consent-fix op de RLS-helper (2026-07-31).
--
-- Probleem: `is_therapist_of()` toetste alleen `"isActive" = true` en negeerde
-- `status`. `patient.revokeTherapistAccess` (src/server/routers/patient.ts) zet
-- bij het intrekken van toegang alleen `status = 'REVOKED'` en laat `isActive`
-- op `true` staan. Een therapeut wiens toegang de patiënt had ingetrokken bleef
-- daardoor op databaseniveau "behandelaar van" die patiënt, en hield via de
-- publieke REST-API leestoegang tot 18 tabellen met klinische data — 41 policies
-- leunen op deze functie.
--
-- Fix: dezelfde drempel als de applicatielaag. `hasPatientAccess()` in
-- src/server/lib/patient-access.ts accepteert `isActive = true` met status
-- APPROVED of PENDING. We spiegelen dat hier letterlijk, zodat de twee lagen
-- niet uit elkaar lopen; DECLINED en REVOKED vallen in beide gevallen af.
--
-- Geen effect op bestaande data: in productie staan 17 APPROVED- en 2
-- PENDING-koppelingen en nul REVOKED. De functie blijft STABLE SECURITY
-- DEFINER met hetzelfde search_path, dus alle 41 policies blijven werken.
--
-- Zie ook 20260731_lock_client_writes_all_tables.sql: die sluit het pad waarlangs
-- een gebruiker zichzelf zo'n koppeling kon aanmaken.

CREATE OR REPLACE FUNCTION public.is_therapist_of(client_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_therapists
    WHERE "patientId" = client_id
      AND "therapistId" = auth.uid()::text
      AND "isActive" = true
      AND status IN ('APPROVED', 'PENDING')
  )
$function$;
