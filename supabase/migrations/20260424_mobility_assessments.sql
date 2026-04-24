-- ============================================================================
-- MBT Move — Mobility Assessment RLS migration
-- ============================================================================
-- 5 nieuwe tabellen voor de Ready-State assessment feature.
--
-- Toegang:
--   - assessment_tests / assessment_test_mobilizations: therapist+admin read,
--     admin write (catalog).
--   - patient_assessments + scores + archetype_summaries: behandelend
--     therapeut + admin full access. Patient heeft geen toegang.
--   - Extra guard op router-niveau: alleen therapeuten met
--     User.canUseAssessment=true (of ADMIN) mogen de endpoints aanroepen.
-- ============================================================================

ALTER TABLE public.assessment_tests                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_test_mobilizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_assessments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_test_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_archetype_summaries    ENABLE ROW LEVEL SECURITY;

-- ------ catalog ------

CREATE POLICY "assessment_tests_read_staff" ON public.assessment_tests
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "assessment_tests_admin_write" ON public.assessment_tests
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "assessment_test_mobs_read_staff" ON public.assessment_test_mobilizations
  FOR SELECT USING (public.is_therapist() OR public.is_admin());

CREATE POLICY "assessment_test_mobs_admin_write" ON public.assessment_test_mobilizations
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------ patient_assessments ------

CREATE POLICY "patient_assessments_select" ON public.patient_assessments
  FOR SELECT USING (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "patient_assessments_insert" ON public.patient_assessments
  FOR INSERT WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "patient_assessments_update" ON public.patient_assessments
  FOR UPDATE USING (public.is_therapist_of("patientId") OR public.is_admin())
  WITH CHECK (public.is_therapist_of("patientId") OR public.is_admin());

CREATE POLICY "patient_assessments_delete" ON public.patient_assessments
  FOR DELETE USING (public.is_therapist_of("patientId") OR public.is_admin());

-- ------ assessment_test_scores (via parent assessment) ------

CREATE POLICY "assessment_scores_select" ON public.assessment_test_scores
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_test_scores."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_scores_insert" ON public.assessment_test_scores
  FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_test_scores."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_scores_update" ON public.assessment_test_scores
  FOR UPDATE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_test_scores."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_test_scores."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_scores_delete" ON public.assessment_test_scores
  FOR DELETE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_test_scores."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

-- ------ assessment_archetype_summaries ------

CREATE POLICY "assessment_summaries_select" ON public.assessment_archetype_summaries
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_archetype_summaries."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_summaries_insert" ON public.assessment_archetype_summaries
  FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_archetype_summaries."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_summaries_update" ON public.assessment_archetype_summaries
  FOR UPDATE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_archetype_summaries."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_archetype_summaries."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );

CREATE POLICY "assessment_summaries_delete" ON public.assessment_archetype_summaries
  FOR DELETE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.patient_assessments pa
      WHERE pa.id = assessment_archetype_summaries."assessmentId"
        AND public.is_therapist_of(pa."patientId")
    )
  );
