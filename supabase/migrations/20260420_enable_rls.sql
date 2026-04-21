-- ============================================================================
-- MBT Move — Row Level Security (RLS) Migration
-- File: supabase/migrations/20260420_enable_rls.sql
-- ============================================================================
-- Purpose: Enable RLS on all tables and define role-based access policies.
-- Roles: PATIENT, ATHLETE, THERAPIST, ADMIN (UserRole enum)
--
-- Rule of thumb:
--   - PATIENT + ATHLETE  = clients (see/log own data)
--   - THERAPIST          = manages linked clients via patient_therapists
--   - ADMIN              = full access
--   - service_role key   = bypasses RLS entirely (use server-side only!)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
-- STABLE + SECURITY DEFINER: cached per query, runs with owner privileges
-- so the function itself can read users.role without recursive RLS issues.

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid()::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text AND role = 'ADMIN'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_therapist()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text AND role IN ('THERAPIST','ADMIN')
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text AND role IN ('PATIENT','ATHLETE')
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Is the current user an active therapist of this client?
CREATE OR REPLACE FUNCTION public.is_therapist_of(client_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_therapists
    WHERE "patientId" = client_id
      AND "therapistId" = auth.uid()::text
      AND "isActive" = true
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. ENABLE RLS ON ALL TABLES
-- ----------------------------------------------------------------------------

ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_therapists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_exercises        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_exercises         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_schedules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_schedule_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardio_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_loads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_checks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymized_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_id_mappings     ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. USERS
-- ----------------------------------------------------------------------------
-- A user may see:
--   - own profile
--   - profile of any user they are linked to via patient_therapists
--   - any user if current user is admin
-- IMPORTANT: application code should SELECT specific columns, never mfaSecret.
-- Consider creating a public view that excludes mfaSecret for frontend use.

CREATE POLICY "users_select" ON public.users FOR SELECT
USING (
  id = auth.uid()::text
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.patient_therapists pt
    WHERE pt."isActive" = true
      AND ((pt."patientId" = users.id AND pt."therapistId" = auth.uid()::text)
        OR (pt."therapistId" = users.id AND pt."patientId" = auth.uid()::text))
  )
);

CREATE POLICY "users_insert_self" ON public.users FOR INSERT
WITH CHECK (id = auth.uid()::text);

CREATE POLICY "users_update_self" ON public.users FOR UPDATE
USING (id = auth.uid()::text OR public.is_admin())
WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- Deletes only via service_role (no policy = no access for anon/authenticated).

-- ----------------------------------------------------------------------------
-- 4. PATIENT_THERAPISTS
-- ----------------------------------------------------------------------------

CREATE POLICY "pt_select" ON public.patient_therapists FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR "therapistId" = auth.uid()::text
  OR public.is_admin()
);

CREATE POLICY "pt_insert_therapist" ON public.patient_therapists FOR INSERT
WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "pt_update_therapist" ON public.patient_therapists FOR UPDATE
USING ("therapistId" = auth.uid()::text OR public.is_admin())
WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "pt_delete_therapist" ON public.patient_therapists FOR DELETE
USING ("therapistId" = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. APPOINTMENTS
-- ----------------------------------------------------------------------------

CREATE POLICY "appointments_select" ON public.appointments FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR "therapistId" = auth.uid()::text
  OR public.is_admin()
);

CREATE POLICY "appointments_insert_therapist" ON public.appointments FOR INSERT
WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "appointments_update_therapist" ON public.appointments FOR UPDATE
USING ("therapistId" = auth.uid()::text OR public.is_admin())
WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "appointments_delete_therapist" ON public.appointments FOR DELETE
USING ("therapistId" = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. EXERCISES (shared library + private)
-- ----------------------------------------------------------------------------

CREATE POLICY "exercises_select" ON public.exercises FOR SELECT
USING (
  "isPublic" = true
  OR "createdById" = auth.uid()::text
  OR public.is_admin()
  -- Clients can see private exercises that appear in their programs
  OR EXISTS (
    SELECT 1 FROM public.program_exercises pe
    JOIN public.programs p ON p.id = pe."programId"
    WHERE pe."exerciseId" = exercises.id
      AND (p."patientId" = auth.uid()::text OR public.is_therapist_of(p."patientId"))
  )
);

CREATE POLICY "exercises_insert_therapist" ON public.exercises FOR INSERT
WITH CHECK (
  public.is_therapist()
  AND "createdById" = auth.uid()::text
);

CREATE POLICY "exercises_update_own" ON public.exercises FOR UPDATE
USING ("createdById" = auth.uid()::text OR public.is_admin())
WITH CHECK ("createdById" = auth.uid()::text OR public.is_admin());

CREATE POLICY "exercises_delete_own" ON public.exercises FOR DELETE
USING ("createdById" = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. EXERCISE_COLLECTIONS + ITEMS
-- ----------------------------------------------------------------------------

CREATE POLICY "collections_select" ON public.exercise_collections FOR SELECT
USING ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "collections_manage" ON public.exercise_collections FOR ALL
USING ("therapistId" = auth.uid()::text OR public.is_admin())
WITH CHECK ("therapistId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "collection_items_select" ON public.exercise_collection_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.exercise_collections ec
    WHERE ec.id = exercise_collection_items."collectionId"
      AND (ec."therapistId" = auth.uid()::text OR public.is_admin())
  )
);

CREATE POLICY "collection_items_manage" ON public.exercise_collection_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.exercise_collections ec
    WHERE ec.id = exercise_collection_items."collectionId"
      AND (ec."therapistId" = auth.uid()::text OR public.is_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercise_collections ec
    WHERE ec.id = exercise_collection_items."collectionId"
      AND (ec."therapistId" = auth.uid()::text OR public.is_admin())
  )
);

-- ----------------------------------------------------------------------------
-- 8. PROGRAMS + PROGRAM_EXERCISES
-- ----------------------------------------------------------------------------

CREATE POLICY "programs_select" ON public.programs FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR "creatorId" = auth.uid()::text
  OR public.is_therapist_of("patientId")
  OR public.is_admin()
  -- Templates visible to all therapists
  OR ("isTemplate" = true AND public.is_therapist())
);

CREATE POLICY "programs_insert_therapist" ON public.programs FOR INSERT
WITH CHECK (
  public.is_therapist()
  AND "creatorId" = auth.uid()::text
);

CREATE POLICY "programs_update_creator" ON public.programs FOR UPDATE
USING ("creatorId" = auth.uid()::text OR public.is_admin())
WITH CHECK ("creatorId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "programs_delete_creator" ON public.programs FOR DELETE
USING ("creatorId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "program_exercises_select" ON public.program_exercises FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_exercises."programId"
      AND (
        p."patientId" = auth.uid()::text
        OR p."creatorId" = auth.uid()::text
        OR public.is_therapist_of(p."patientId")
        OR public.is_admin()
        OR (p."isTemplate" = true AND public.is_therapist())
      )
  )
);

CREATE POLICY "program_exercises_manage" ON public.program_exercises FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_exercises."programId"
      AND (p."creatorId" = auth.uid()::text OR public.is_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_exercises."programId"
      AND (p."creatorId" = auth.uid()::text OR public.is_admin())
  )
);

-- ----------------------------------------------------------------------------
-- 9. WEEK_SCHEDULES + DAYS
-- ----------------------------------------------------------------------------

CREATE POLICY "week_schedules_select" ON public.week_schedules FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR "creatorId" = auth.uid()::text
  OR public.is_therapist_of("patientId")
  OR public.is_admin()
  OR ("isTemplate" = true AND public.is_therapist())
);

CREATE POLICY "week_schedules_manage" ON public.week_schedules FOR ALL
USING ("creatorId" = auth.uid()::text OR public.is_admin())
WITH CHECK (
  ("creatorId" = auth.uid()::text AND public.is_therapist())
  OR public.is_admin()
);

CREATE POLICY "week_schedule_days_select" ON public.week_schedule_days FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.week_schedules ws
    WHERE ws.id = week_schedule_days."weekScheduleId"
      AND (
        ws."patientId" = auth.uid()::text
        OR ws."creatorId" = auth.uid()::text
        OR public.is_therapist_of(ws."patientId")
        OR public.is_admin()
      )
  )
);

CREATE POLICY "week_schedule_days_manage" ON public.week_schedule_days FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.week_schedules ws
    WHERE ws.id = week_schedule_days."weekScheduleId"
      AND (ws."creatorId" = auth.uid()::text OR public.is_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.week_schedules ws
    WHERE ws.id = week_schedule_days."weekScheduleId"
      AND (ws."creatorId" = auth.uid()::text OR public.is_admin())
  )
);

-- ----------------------------------------------------------------------------
-- 10. SESSION_LOGS
-- ----------------------------------------------------------------------------

CREATE POLICY "session_logs_select" ON public.session_logs FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR public.is_therapist_of("patientId")
  OR public.is_admin()
);

CREATE POLICY "session_logs_insert_own" ON public.session_logs FOR INSERT
WITH CHECK ("patientId" = auth.uid()::text OR public.is_therapist_of("patientId"));

CREATE POLICY "session_logs_update_own" ON public.session_logs FOR UPDATE
USING ("patientId" = auth.uid()::text OR public.is_therapist_of("patientId"))
WITH CHECK ("patientId" = auth.uid()::text OR public.is_therapist_of("patientId"));

-- ----------------------------------------------------------------------------
-- 11. EXERCISE_LOGS (linked via session_logs)
-- ----------------------------------------------------------------------------

CREATE POLICY "exercise_logs_select" ON public.exercise_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.session_logs sl
    WHERE sl.id = exercise_logs."sessionId"
      AND (
        sl."patientId" = auth.uid()::text
        OR public.is_therapist_of(sl."patientId")
        OR public.is_admin()
      )
  )
);

CREATE POLICY "exercise_logs_manage_own" ON public.exercise_logs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.session_logs sl
    WHERE sl.id = exercise_logs."sessionId"
      AND (sl."patientId" = auth.uid()::text OR public.is_therapist_of(sl."patientId"))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.session_logs sl
    WHERE sl.id = exercise_logs."sessionId"
      AND (sl."patientId" = auth.uid()::text OR public.is_therapist_of(sl."patientId"))
  )
);

-- ----------------------------------------------------------------------------
-- 12. CARDIO_LOGS
-- ----------------------------------------------------------------------------

CREATE POLICY "cardio_logs_select" ON public.cardio_logs FOR SELECT
USING (
  "patientId" = auth.uid()::text
  OR public.is_therapist_of("patientId")
  OR public.is_admin()
);

CREATE POLICY "cardio_logs_manage_own" ON public.cardio_logs FOR ALL
USING ("patientId" = auth.uid()::text OR public.is_therapist_of("patientId"))
WITH CHECK ("patientId" = auth.uid()::text OR public.is_therapist_of("patientId"));

-- ----------------------------------------------------------------------------
-- 13. WELLNESS_CHECKS
-- ----------------------------------------------------------------------------

CREATE POLICY "wellness_checks_select" ON public.wellness_checks FOR SELECT
USING (
  "userId" = auth.uid()::text
  OR public.is_therapist_of("userId")
  OR public.is_admin()
);

CREATE POLICY "wellness_checks_manage_own" ON public.wellness_checks FOR ALL
USING ("userId" = auth.uid()::text)
WITH CHECK ("userId" = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 14. FAVORITE_EXERCISES (strictly personal)
-- ----------------------------------------------------------------------------

CREATE POLICY "favorites_own" ON public.favorite_exercises FOR ALL
USING ("userId" = auth.uid()::text)
WITH CHECK ("userId" = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 15. MUSCLE_LOADS (exercise metadata lookup)
-- ----------------------------------------------------------------------------
-- These are lookup values attached to exercises (which muscles does exercise X
-- load and how much). They are NOT user data — treat as shared reference data.

CREATE POLICY "muscle_loads_select_all" ON public.muscle_loads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = muscle_loads."exerciseId"
      AND (
        e."isPublic" = true
        OR e."createdById" = auth.uid()::text
        OR public.is_admin()
      )
  )
);

CREATE POLICY "muscle_loads_manage_creator" ON public.muscle_loads FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = muscle_loads."exerciseId"
      AND (e."createdById" = auth.uid()::text OR public.is_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = muscle_loads."exerciseId"
      AND (e."createdById" = auth.uid()::text OR public.is_admin())
  )
);

-- ----------------------------------------------------------------------------
-- 16. MESSAGES
-- ----------------------------------------------------------------------------

CREATE POLICY "messages_select" ON public.messages FOR SELECT
USING (
  "senderId" = auth.uid()::text
  OR "recipientId" = auth.uid()::text
  OR public.is_admin()
);

CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT
WITH CHECK ("senderId" = auth.uid()::text);

-- Only the recipient can update (e.g. mark as read)
CREATE POLICY "messages_update_recipient" ON public.messages FOR UPDATE
USING ("recipientId" = auth.uid()::text)
WITH CHECK ("recipientId" = auth.uid()::text);

-- Deletes via service_role only (GDPR cleanup)

-- ----------------------------------------------------------------------------
-- 17. NOTIFICATIONS
-- ----------------------------------------------------------------------------

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
USING ("userId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
USING ("userId" = auth.uid()::text)
WITH CHECK ("userId" = auth.uid()::text);

-- INSERT only via service_role (backend creates notifications)
-- DELETE only via service_role

-- ----------------------------------------------------------------------------
-- 18. RESEARCH_CONSENTS (GDPR-critical)
-- ----------------------------------------------------------------------------

CREATE POLICY "research_consents_select_own" ON public.research_consents FOR SELECT
USING ("userId" = auth.uid()::text OR public.is_admin());

CREATE POLICY "research_consents_manage_own" ON public.research_consents FOR ALL
USING ("userId" = auth.uid()::text)
WITH CHECK ("userId" = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 19. ANONYMIZED_RECORDS (research database)
-- ----------------------------------------------------------------------------
-- Only admins can query via the app. For actual research exports,
-- use service_role through a dedicated backend route.

CREATE POLICY "anonymized_records_admin_select" ON public.anonymized_records FOR SELECT
USING (public.is_admin());

-- INSERT/UPDATE/DELETE: service_role only (automated ETL).

-- ----------------------------------------------------------------------------
-- 20. ANONYMOUS_ID_MAPPINGS (maximum lockdown)
-- ----------------------------------------------------------------------------
-- NO policies = NO access via anon or authenticated keys.
-- Only service_role can read/write. This is the re-identification table —
-- it must NEVER be exposed to the frontend under any circumstance.

-- (intentionally no CREATE POLICY statements)

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
