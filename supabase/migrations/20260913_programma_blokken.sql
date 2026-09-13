-- Programma-builder op de bloklijst: dezelfde kolommen als
-- week_schedule_day_item_exercises (zie 20260913_planner_blokken.sql), plus
-- groepen (superset/circuit) per week-dag op het programma. Additief.

ALTER TABLE public.program_exercises
  ALTER COLUMN "exerciseId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "blockKind"      TEXT    NOT NULL DEFAULT 'EXERCISE',
  ADD COLUMN IF NOT EXISTS "repsPerSet"     JSONB,
  ADD COLUMN IF NOT EXISTS "amrap"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phase"          TEXT,
  ADD COLUMN IF NOT EXISTS "isBodyweight"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "completionOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trackMax"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "text"           TEXT,
  ADD COLUMN IF NOT EXISTS "videoUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "durationSec"    INTEGER;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS "groups" JSONB;
