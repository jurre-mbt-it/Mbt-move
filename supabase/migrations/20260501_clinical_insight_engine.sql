-- ============================================================================
-- MBT Move — Clinical Insight Engine (CIE) RLS migration
-- File: supabase/migrations/20260501_clinical_insight_engine.sql
-- ============================================================================
-- Purpose: enable RLS + define policies for the 5 CIE tables created by
--          `prisma db push` from schema.prisma.
--
-- Tables:
--   - patient_insight_status      (opt-in per patient, objection flag)
--   - insights                    (generated suggestion rows)
--   - insight_actions             (therapist action audit trail)
--   - therapist_insight_prefs     (per-therapist config)
--   - insight_rules               (rule catalog)
--
-- Access model:
--   - PATIENT + ATHLETE: NO access to any CIE table (engine is therapist-only).
--   - THERAPIST: access insights of linked patients via is_therapist_of().
--                Own prefs only. Read rules.
--   - ADMIN: full access.
--   - service_role: bypasses RLS (used by cron for INSERT into insights).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENABLE RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.patient_insight_status    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_actions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_insight_prefs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_rules             ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- patient_insight_status — therapist of patient + admin can SELECT/INSERT/UPDATE
-- Patient has NO policy = no access via anon/authenticated keys.
-- ----------------------------------------------------------------------------

CREATE POLICY "insight_status_select_therapist" ON public.patient_insight_status
  FOR SELECT USING (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "insight_status_insert_therapist" ON public.patient_insight_status
  FOR INSERT WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "insight_status_update_therapist" ON public.patient_insight_status
  FOR UPDATE USING (public.is_therapist_of("patientId") OR public.is_admin())
  WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

-- ----------------------------------------------------------------------------
-- insights — active therapist of patient + admin. INSERT only via service_role
-- (cron job). No INSERT policy = nobody via anon/auth key can insert.
-- ----------------------------------------------------------------------------

CREATE POLICY "insights_select_therapist" ON public.insights
  FOR SELECT USING (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "insights_update_therapist" ON public.insights
  FOR UPDATE USING (public.is_therapist_of("patientId") OR public.is_admin())
  WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

-- ----------------------------------------------------------------------------
-- insight_actions — therapist of insight's patient can SELECT/INSERT.
-- Therapist can only insert with their own therapistId.
-- ----------------------------------------------------------------------------

CREATE POLICY "insight_actions_select_therapist" ON public.insight_actions
  FOR SELECT USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.insights i
      WHERE i.id = insight_actions."insightId"
        AND public.is_therapist_of(i."patientId")
    )
  );

CREATE POLICY "insight_actions_insert_therapist" ON public.insight_actions
  FOR INSERT WITH CHECK (
    (public.is_admin() OR "therapistId" = auth.uid()::text)
    AND EXISTS (
      SELECT 1 FROM public.insights i
      WHERE i.id = insight_actions."insightId"
        AND (public.is_admin() OR public.is_therapist_of(i."patientId"))
    )
  );

-- ----------------------------------------------------------------------------
-- therapist_insight_prefs — owner OR admin
-- ----------------------------------------------------------------------------

CREATE POLICY "insight_prefs_select_owner" ON public.therapist_insight_prefs
  FOR SELECT USING ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "insight_prefs_insert_owner" ON public.therapist_insight_prefs
  FOR INSERT WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "insight_prefs_update_owner" ON public.therapist_insight_prefs
  FOR UPDATE USING ("therapistId" = auth.uid()::text OR public.is_admin())
  WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "insight_prefs_delete_owner" ON public.therapist_insight_prefs
  FOR DELETE USING ("therapistId" = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- insight_rules — therapist + admin read; admin write
-- ----------------------------------------------------------------------------

CREATE POLICY "insight_rules_select_all_staff" ON public.insight_rules
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "insight_rules_admin_write" ON public.insight_rules
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
