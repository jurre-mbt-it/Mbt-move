-- Fase 1 backfill: voor elke bestaande WeekScheduleDay met programId,
-- maak één rij in week_schedule_day_items aan zodat de UI consistent blijft
-- werken zodra die naar `items[]` overgaat. Legacy `programId` op de dag-rij
-- blijft naast de nieuwe items staan tot Fase 5 alle consumers gemigreerd zijn.
--
-- Idempotent: skipt dagen waar al een item bestaat met dezelfde programId
-- (zodat opnieuw runnen geen duplicaten oplevert).

INSERT INTO public.week_schedule_day_items (id, "dayId", "order", "programId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text AS id,
  d.id AS "dayId",
  0 AS "order",
  d."programId" AS "programId",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM public.week_schedule_days d
WHERE d."programId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.week_schedule_day_items i
    WHERE i."dayId" = d.id AND i."programId" = d."programId"
  );
