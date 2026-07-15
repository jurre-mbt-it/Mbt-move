-- De planner-lus sluiten: geplande items worden uitvoerbaar en herleidbaar.
--
-- Drie dingen:
--   1. session_logs → week_schedule_day_items (FK). Tot nu toe werd gepland vs
--      gelogd gematcht op (programId, datum), en voor quick-workouts op een
--      teller per dag — twee workouts op één dag waren niet te onderscheiden.
--   2. Voorschrift-pariteit op inline oefeningen, zodat een therapeut die in de
--      kalender bouwt dezelfde RPE/%1RM/superset-laag heeft als in de builder.
--   3. Geplande belasting (duur × RPE) op het item, in dezelfde sRPE-eenheid
--      als de gerealiseerde load-curve.
--
-- Alles additief en nullable. Idempotent.

-- 1. Koppeling sessie → gepland item
ALTER TABLE public.session_logs
  ADD COLUMN IF NOT EXISTS "weekScheduleDayItemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_logs_weekScheduleDayItemId_fkey'
  ) THEN
    ALTER TABLE public.session_logs
      ADD CONSTRAINT "session_logs_weekScheduleDayItemId_fkey"
      FOREIGN KEY ("weekScheduleDayItemId") REFERENCES public.week_schedule_day_items(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "session_logs_weekScheduleDayItemId_idx"
  ON public.session_logs("weekScheduleDayItemId");

-- 2. Voorschrift-pariteit op inline oefeningen
ALTER TABLE public.week_schedule_day_item_exercises
  ADD COLUMN IF NOT EXISTS "setsMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "repsMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "intensityType" "IntensityType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "intensityMin" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "intensityMax" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "intensityText" TEXT,
  ADD COLUMN IF NOT EXISTS "supersetGroup" TEXT,
  ADD COLUMN IF NOT EXISTS "supersetOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extraParams" JSONB NOT NULL DEFAULT '[]';

-- 3. Geplande belasting op het item
ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "plannedDurationSec" INTEGER,
  ADD COLUMN IF NOT EXISTS "plannedRpe" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'week_item_planned_rpe_range') THEN
    ALTER TABLE public.week_schedule_day_items
      ADD CONSTRAINT week_item_planned_rpe_range
      CHECK ("plannedRpe" IS NULL OR ("plannedRpe" >= 1 AND "plannedRpe" <= 10)) NOT VALID;
  END IF;
END $$;
