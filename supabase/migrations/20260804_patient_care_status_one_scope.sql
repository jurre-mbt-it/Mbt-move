-- Precies één scope-kolom op patient_care_status (2026-08-04).
--
-- Vervolg op 20260803_patient_care_status.sql. De twee partiële unique
-- indexen daar dekken "niet twee keer dezelfde patiënt binnen één scope",
-- maar niet de scope-sleutel zelf. Ze laten allebei deze vormen toe:
--
--   * "practiceId" EN "coachId" gevuld: de markering is dan in twee scopes
--     zichtbaar, dus een coach zou een praktijk-patiënt kunnen archiveren of
--     terughalen en andersom.
--   * allebei NULL: de rij is voor niemand vindbaar, de patiënt lijkt actief
--     terwijl er wel een uitbehandel-rij staat, en heractiveren komt er nooit
--     meer bij.
--
-- careScopeKey() in src/server/lib/care-scope.ts is vandaag de enige schrijver
-- en levert altijd precies één kolom. Dit is defense-in-depth op de sleutel
-- waar de hele feature op leunt.
--
-- ADD CONSTRAINT kent geen IF NOT EXISTS, dus dezelfde DO-vorm als de FK's in
-- 20260801_rehab_episodes_a.sql. Daarmee is het bestand idempotent.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_care_status_one_scope') THEN
    ALTER TABLE public.patient_care_status
      ADD CONSTRAINT "patient_care_status_one_scope"
      CHECK (num_nonnulls("practiceId", "coachId") = 1);
  END IF;
END $$;
