-- ============================================================================
-- MBT Move — Revalidatie-protocol RLS migration
-- File: supabase/migrations/20260424_rehab_protocols.sql
-- ============================================================================
-- Purpose: enable RLS + policies voor de 5 Rehab-tabellen.
--
-- Access model:
--   - rehab_protocols / phases / criteria: catalog, therapist+admin READ,
--     admin WRITE.
--   - patient_rehab_trackers: behandelend therapeut + admin full access.
--     Patient GEEN access (tracker is therapeut-facing).
--   - rehab_criterion_status: behandelend therapeut + admin full access.
-- ============================================================================

ALTER TABLE public.rehab_protocols          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_phases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_criteria           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_rehab_trackers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_criterion_status   ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- rehab_protocols — therapist+admin read, admin write
-- ----------------------------------------------------------------------------
CREATE POLICY "rehab_protocols_read_staff" ON public.rehab_protocols
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "rehab_protocols_admin_write" ON public.rehab_protocols
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- rehab_phases — therapist+admin read, admin write
-- ----------------------------------------------------------------------------
CREATE POLICY "rehab_phases_read_staff" ON public.rehab_phases
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "rehab_phases_admin_write" ON public.rehab_phases
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- rehab_criteria — therapist+admin read, admin write
-- ----------------------------------------------------------------------------
CREATE POLICY "rehab_criteria_read_staff" ON public.rehab_criteria
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "rehab_criteria_admin_write" ON public.rehab_criteria
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- patient_rehab_trackers — behandelend therapeut + admin
-- ----------------------------------------------------------------------------
CREATE POLICY "rehab_tracker_select_therapist" ON public.patient_rehab_trackers
  FOR SELECT USING (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_tracker_insert_therapist" ON public.patient_rehab_trackers
  FOR INSERT WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_tracker_update_therapist" ON public.patient_rehab_trackers
  FOR UPDATE USING (public.is_therapist_of("patientId") OR public.is_admin())
  WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_tracker_delete_therapist" ON public.patient_rehab_trackers
  FOR DELETE USING (public.is_therapist_of("patientId") OR public.is_admin());

-- ----------------------------------------------------------------------------
-- rehab_criterion_status — behandelend therapeut + admin
-- ----------------------------------------------------------------------------
CREATE POLICY "rehab_status_select_therapist" ON public.rehab_criterion_status
  FOR SELECT USING (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_status_insert_therapist" ON public.rehab_criterion_status
  FOR INSERT WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_status_update_therapist" ON public.rehab_criterion_status
  FOR UPDATE USING (public.is_therapist_of("patientId") OR public.is_admin())
  WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "rehab_status_delete_therapist" ON public.rehab_criterion_status
  FOR DELETE USING (public.is_therapist_of("patientId") OR public.is_admin());
