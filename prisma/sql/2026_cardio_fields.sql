-- Cardio-logging uitbreiding (athlete-rol): HR-profiel op users + rijkere
-- CardioLog-velden. Additief en nullable → niet-destructief, idempotent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "maxHeartRate" integer,
  ADD COLUMN IF NOT EXISTS "restingHeartRate" integer,
  ADD COLUMN IF NOT EXISTS "lthr" integer;

ALTER TABLE public.cardio_logs
  ADD COLUMN IF NOT EXISTS "targetZone" integer,
  ADD COLUMN IF NOT EXISTS "timeInZones" jsonb,
  ADD COLUMN IF NOT EXISTS "avgPaceSecPerKm" integer;
