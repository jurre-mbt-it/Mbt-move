-- Planner inline-workout content: oefeningen + cardio-params op een
-- WeekScheduleDayItem (quick-workout). Eén migratie incl. RLS+default_deny
-- conform de praktijk-regel (nieuwe public-tabel = RLS in dezelfde migratie).
-- Kolomnamen volgen Prisma's veldnamen (geen snake_case) zodat de gegenereerde
-- client matcht.

-- 1) Cardio-parameters op het bestaande item.
ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "cardioParams" JSONB;

-- 2) Nieuwe tabel met inline-oefeningen per quick-workout.
CREATE TABLE IF NOT EXISTS public.week_schedule_day_item_exercises (
  "id"         TEXT PRIMARY KEY,
  "itemId"     TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "sets"       INTEGER NOT NULL DEFAULT 3,
  "reps"       INTEGER NOT NULL DEFAULT 10,
  "repUnit"    TEXT NOT NULL DEFAULT 'reps',
  "restTime"   INTEGER,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wsdie_item_fkey"
    FOREIGN KEY ("itemId") REFERENCES public.week_schedule_day_items("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "wsdie_exercise_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES public.exercises("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "wsdie_item_order_idx"
  ON public.week_schedule_day_item_exercises ("itemId", "order");

-- 3) RLS aan + deny-all (Prisma draait als owner en bypasst RLS; anon-key niet).
ALTER TABLE public.week_schedule_day_item_exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.week_schedule_day_item_exercises;
CREATE POLICY "default_deny" ON public.week_schedule_day_item_exercises
  FOR ALL TO public USING (false) WITH CHECK (false);
