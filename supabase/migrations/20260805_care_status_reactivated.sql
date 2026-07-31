-- Partiële unique indexen op patient_care_status opnieuw, nu met historie
-- (2026-08-05).
--
-- `patients.reactivate` verwijderde de uitbehandel-rij. Dat doet hij niet meer:
-- hij zet `reactivatedAt` + `reactivatedById` en laat de rij staan, zodat de
-- reden en de vrije toelichting van die behandelperiode terug te lezen blijven.
-- Die toelichting is een klinisch oordeel en mag vanwege de PII-regel niet in
-- AuditLog.metadata, dus de rij is de enige plek waar hij bewaard wordt.
--
-- Daarmee kloppen de indexen uit 20260803_patient_care_status.sql niet meer.
-- Die staan op ("patientId", "practiceId") WHERE "practiceId" IS NOT NULL en
-- op ("patientId", "coachId") WHERE "coachId" IS NOT NULL, dus ze tellen ook
-- afgesloten periodes mee. Zonder dit bestand gaat het zo mis:
--
--   1. Therapeut zet Jan op inactief. Rij 1.
--   2. Jan komt terug, therapeut heractiveert. Rij 1 krijgt reactivatedAt.
--   3. Jan rondt zijn tweede traject af, therapeut zet hem weer op inactief.
--      De INSERT botst met rij 1 en `alsConflict` vertaalt dat naar "Deze
--      patiënt staat al op inactief" terwijl hij juist actief is. Jan is
--      daarna nooit meer te archiveren, en de melding wijst de verkeerde kant
--      op.
--
-- De voorwaarde die we willen bewaken is "hoogstens één LOPENDE markering per
-- patiënt per scope", dus komt `AND "reactivatedAt" IS NULL` erbij. Een
-- afgesloten periode telt niet mee en botst met niets.
--
-- DRAAIT NA de `npx prisma db push` die reactivatedAt/reactivatedById
-- toevoegt. Push negeert partiële indexen en laat de oude staan; DROP INDEX
-- IF EXISTS + CREATE maakt dit bestand idempotent.

DROP INDEX IF EXISTS public."patient_care_status_one_per_practice";
DROP INDEX IF EXISTS public."patient_care_status_one_per_coach";

CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_practice"
  ON public.patient_care_status ("patientId", "practiceId")
  WHERE "practiceId" IS NOT NULL AND "reactivatedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_coach"
  ON public.patient_care_status ("patientId", "coachId")
  WHERE "coachId" IS NOT NULL AND "reactivatedAt" IS NULL;
