-- Cardio-logs koppelen aan het geplande item, net als session_logs.
--
-- Zonder dit matcht de planner geplande cardio op "er is die dag íets aan
-- cardio gelogd" (een teller per dag), waardoor twee cardio-workouts op één dag
-- niet te onderscheiden zijn. Additief en nullable; idempotent.

ALTER TABLE public.cardio_logs
  ADD COLUMN IF NOT EXISTS "weekScheduleDayItemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cardio_logs_weekScheduleDayItemId_fkey'
  ) THEN
    ALTER TABLE public.cardio_logs
      ADD CONSTRAINT "cardio_logs_weekScheduleDayItemId_fkey"
      FOREIGN KEY ("weekScheduleDayItemId") REFERENCES public.week_schedule_day_items(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cardio_logs_weekScheduleDayItemId_idx"
  ON public.cardio_logs("weekScheduleDayItemId");
