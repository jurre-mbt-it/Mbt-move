-- ============================================================================
-- MBT Move — Enable RLS op week_schedule_day_items
-- File: supabase/migrations/20260519_week_schedule_day_items_rls.sql
-- ============================================================================
-- De `week_schedule_day_items`-tabel is later toegevoegd (multi-workout per dag)
-- en werd niet meegenomen in 20260420_enable_rls.sql — Supabase Advisor flagde
-- dit als "rls_disabled_in_public" (CRITICAL).
--
-- Patroon volgt week_schedule_days: toegang loopt via de parent WeekSchedule,
-- waar de policy zit (patient/creator/therapist-of-patient/admin).
--
-- Net als bij andere tabellen: Prisma draait via service_role en bypasst RLS,
-- dus dit is defense-in-depth voor queries via de Supabase JS-client met
-- anon/authenticated key. Geen functionele impact op de huidige app.
-- ============================================================================

ALTER TABLE public.week_schedule_day_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "week_schedule_day_items_select" ON public.week_schedule_day_items;
CREATE POLICY "week_schedule_day_items_select" ON public.week_schedule_day_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.week_schedule_days d
      JOIN public.week_schedules ws ON ws.id = d."weekScheduleId"
      WHERE d.id = week_schedule_day_items."dayId"
        AND (
          ws."patientId" = auth.uid()::text
          OR ws."creatorId" = auth.uid()::text
          OR public.is_therapist_of(ws."patientId")
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "week_schedule_day_items_manage" ON public.week_schedule_day_items;
CREATE POLICY "week_schedule_day_items_manage" ON public.week_schedule_day_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.week_schedule_days d
      JOIN public.week_schedules ws ON ws.id = d."weekScheduleId"
      WHERE d.id = week_schedule_day_items."dayId"
        AND (ws."creatorId" = auth.uid()::text OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.week_schedule_days d
      JOIN public.week_schedules ws ON ws.id = d."weekScheduleId"
      WHERE d.id = week_schedule_day_items."dayId"
        AND (ws."creatorId" = auth.uid()::text OR public.is_admin())
    )
  );
