-- Kinvent: RFD op sprongen en een eigen tabel voor krachttests met herhalingen
-- (2026-09-14). Idempotent; RLS default_deny op de nieuwe tabellen.

ALTER TABLE public.kinvent_jump_reps
  ADD COLUMN IF NOT EXISTS "rfdTotal" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rfdLeft" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rfdRight" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS public.kinvent_strength_results (
  "id"           TEXT NOT NULL,
  "patientId"    TEXT NOT NULL,
  "protocolCode" TEXT NOT NULL,
  "activityCode" TEXT NOT NULL,
  "performedAt"  TIMESTAMP(3) NOT NULL,
  "exerciseType" TEXT,
  "title"        TEXT,
  "deviceType"   TEXT,
  "leftMaxKg"    DOUBLE PRECISION,
  "rightMaxKg"   DOUBLE PRECISION,
  "singleMaxKg"  DOUBLE PRECISION,
  "importedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kinvent_strength_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_strength_results_activityCode_key"
  ON public.kinvent_strength_results ("activityCode");
CREATE INDEX IF NOT EXISTS "kinvent_strength_results_patientId_performedAt_idx"
  ON public.kinvent_strength_results ("patientId", "performedAt");

CREATE TABLE IF NOT EXISTS public.kinvent_strength_reps (
  "id"          TEXT NOT NULL,
  "resultId"    TEXT NOT NULL,
  "ordinal"     INTEGER NOT NULL,
  "repCode"     TEXT,
  "side"        TEXT,
  "maxKg"       DOUBLE PRECISION,
  "averageKg"   DOUBLE PRECISION,
  "rfdToMax"    DOUBLE PRECISION,
  "rfdAverage"  DOUBLE PRECISION,
  "timeToMaxMs" DOUBLE PRECISION,
  "impulseNs"   DOUBLE PRECISION,
  CONSTRAINT "kinvent_strength_reps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_strength_reps_resultId_ordinal_key"
  ON public.kinvent_strength_reps ("resultId", "ordinal");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_strength_results_patientId_fkey') THEN
    ALTER TABLE public.kinvent_strength_results ADD CONSTRAINT "kinvent_strength_results_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES public.users("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_strength_reps_resultId_fkey') THEN
    ALTER TABLE public.kinvent_strength_reps ADD CONSTRAINT "kinvent_strength_reps_resultId_fkey"
      FOREIGN KEY ("resultId") REFERENCES public.kinvent_strength_results("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE public.kinvent_strength_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_strength_results;
CREATE POLICY "default_deny" ON public.kinvent_strength_results FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_strength_results FROM anon, authenticated;

ALTER TABLE public.kinvent_strength_reps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_strength_reps;
CREATE POLICY "default_deny" ON public.kinvent_strength_reps FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_strength_reps FROM anon, authenticated;
