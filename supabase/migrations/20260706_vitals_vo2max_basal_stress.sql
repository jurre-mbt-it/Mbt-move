-- Wearables-uitbreiding (juli 2026):
--  1) VitalsEntry: basaalverbranding (voor totale calorieën) + Apple VO2max.
--     Bestaande tabel, alleen nullable kolommen → geen RLS-wijziging nodig.
--  2) StressEntry: nieuwe tabel voor de daily stress-meter (Athlytic-stijl %HRR).
--     NIEUWE public-tabel → RLS + default_deny verplicht (zie AGENTS.md).
-- Idempotent (IF NOT EXISTS / duplicate_object-guards).

-- 1) VitalsEntry-kolommen ----------------------------------------------------
ALTER TABLE public.vitals_entries
  ADD COLUMN IF NOT EXISTS "basalEnergyKcal" integer;

ALTER TABLE public.vitals_entries
  ADD COLUMN IF NOT EXISTS "vo2Max" double precision;

-- 2) StressEntry-tabel -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "stress_entries" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "date"             TIMESTAMP(3) NOT NULL,
  "avgScore"         INTEGER,
  "restingHeartRate" INTEGER,
  "samples"          JSONB,
  "timeInBands"      JSONB,
  "source"           "WorkoutSource" NOT NULL DEFAULT 'APPLE_WATCH',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stress_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "stress_entries_userId_date_idx" ON "stress_entries"("userId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "stress_entries_userId_date_key" ON "stress_entries"("userId", "date");

DO $$ BEGIN
  ALTER TABLE "stress_entries" ADD CONSTRAINT "stress_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS: Prisma draait als owner en bypasst RLS, dus deny-all volstaat. De
-- anon-key mag deze tabel nooit rechtstreeks kunnen lezen/schrijven.
ALTER TABLE public.stress_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.stress_entries;
CREATE POLICY "default_deny" ON public.stress_entries
  FOR ALL TO public USING (false) WITH CHECK (false);
