-- Expliciet `kind` op week_schedule_day_items, plus cardio-activiteit en een
-- koppeling naar een testbatterij.
--
-- Waarom: de dag droeg tot nu toe alleen workouts, met de impliciete conventie
-- "exact één van programId of quickCategory". Met rustdag/notitie/test/doel op
-- de kalender houdt die conventie geen stand en moet het type expliciet zijn.
--
-- Idempotent: veilig om opnieuw te draaien.

-- 1. Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WeekItemKind') THEN
    CREATE TYPE "WeekItemKind" AS ENUM ('PROGRAM', 'WORKOUT', 'REST', 'NOTE', 'TEST', 'EVENT');
  END IF;
END $$;

-- 2. Kolommen
ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "kind" "WeekItemKind" NOT NULL DEFAULT 'WORKOUT';

ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "quickActivity" "CardioActivity";

ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "testBatteryId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'week_schedule_day_items_testBatteryId_fkey'
  ) THEN
    ALTER TABLE public.week_schedule_day_items
      ADD CONSTRAINT "week_schedule_day_items_testBatteryId_fkey"
      FOREIGN KEY ("testBatteryId") REFERENCES public.test_batteries(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Backfill: bestaande rijen met een programma zijn PROGRAM, de rest WORKOUT
--    (dat is al de default, maar expliciet voor de duidelijkheid).
UPDATE public.week_schedule_day_items
SET "kind" = 'PROGRAM'
WHERE "programId" IS NOT NULL AND "kind" <> 'PROGRAM';

UPDATE public.week_schedule_day_items
SET "kind" = 'WORKOUT'
WHERE "programId" IS NULL AND "kind" IS DISTINCT FROM 'WORKOUT';

-- 4. Invarianten per kind. Bewust NOT VALID → bestaande rijen worden niet
--    geblokkeerd als er historisch iets raars in staat; nieuwe rijen wel.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'week_item_kind_shape') THEN
    ALTER TABLE public.week_schedule_day_items
      ADD CONSTRAINT week_item_kind_shape CHECK (
        CASE "kind"
          WHEN 'PROGRAM' THEN "programId" IS NOT NULL
          WHEN 'WORKOUT' THEN "quickCategory" IS NOT NULL AND "quickName" IS NOT NULL
          WHEN 'TEST'    THEN "testBatteryId" IS NOT NULL
          WHEN 'NOTE'    THEN "quickName" IS NOT NULL
          WHEN 'EVENT'   THEN "quickName" IS NOT NULL
          WHEN 'REST'    THEN "programId" IS NULL AND "quickCategory" IS NULL
          ELSE true
        END
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "week_schedule_day_items_kind_idx"
  ON public.week_schedule_day_items("kind");
