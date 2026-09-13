-- Planner-blokken: de rijen-tabel van een planner-workout wordt een geordende
-- lijst van oefeningen, notities en pauzes. Additief en achterwaarts
-- compatibel: bestaande rijen blijven EXERCISE met een gevulde exerciseId.
-- Kolomnamen volgen Prisma's veldnamen (camelCase, geen snake_case).
-- Ontwerp: docs/superpowers/specs/2026-09-13-planner-blokken-design.md

ALTER TABLE public.week_schedule_day_item_exercises
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

-- Groepen (superset/circuit) per letter, als JSON op het workout-item.
ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "groups" JSONB;
