-- Dagelijkse stappen + actieve verbranding (kcal) uit HealthKit op VitalsEntry.
-- Idempotent (IF NOT EXISTS); bestaande tabel, alleen nullable kolommen → geen RLS-wijziging.

ALTER TABLE public.vitals_entries
  ADD COLUMN IF NOT EXISTS "steps" integer;

ALTER TABLE public.vitals_entries
  ADD COLUMN IF NOT EXISTS "activeEnergyKcal" integer;
