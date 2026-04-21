-- Multi-tenant RLS policies voor practice-scope.
--
-- Belangrijk: momenteel bypasst de Prisma client RLS via service-role key
-- (zie memory/project_rls_prisma_role.md). Deze policies beschermen
-- dus vooralsnog alleen directe Supabase-client access (bv. RLS-enabled
-- anon/authenticated queries vanuit de mobile app). Wanneer Prisma ooit
-- overgaat op `authenticated` role zijn deze policies meteen actief.
--
-- Filosofie:
--   - ADMIN ziet alles (practice-agnostic)
--   - Users zien data binnen hun eigen practiceId
--   - Legacy data (practiceId = NULL) blijft zichtbaar voor iedereen —
--     zodat bestaande oefeningen/patients niet opeens onbereikbaar worden
--     totdat we handmatig migreren.

-- ============================================================
-- Helper: eigen practice van de ingelogde user
-- ============================================================
CREATE OR REPLACE FUNCTION auth.user_practice_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT "practiceId" FROM users WHERE id = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE id = auth.uid()::text LIMIT 1;
$$;

-- ============================================================
-- users: eigen profiel + same-practice
-- ============================================================
DROP POLICY IF EXISTS "users practice scope" ON users;
CREATE POLICY "users practice scope" ON users
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR id = auth.uid()::text
    OR "practiceId" IS NULL
    OR "practiceId" = auth.user_practice_id()
  );

-- ============================================================
-- exercises: public + own + same-practice
-- ============================================================
DROP POLICY IF EXISTS "exercises practice scope" ON exercises;
CREATE POLICY "exercises practice scope" ON exercises
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "isPublic" = true
    OR "createdById" = auth.uid()::text
    OR "practiceId" = auth.user_practice_id()
    OR "practiceId" IS NULL
  );

DROP POLICY IF EXISTS "exercises insert same practice" ON exercises;
CREATE POLICY "exercises insert same practice" ON exercises
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'ADMIN'
    OR "createdById" = auth.uid()::text
  );

DROP POLICY IF EXISTS "exercises update own or admin" ON exercises;
CREATE POLICY "exercises update own or admin" ON exercises
  FOR UPDATE
  USING (
    auth.user_role() = 'ADMIN'
    OR "createdById" = auth.uid()::text
  );

-- ============================================================
-- patient_therapists: zichtbaar voor betrokkenen
-- ============================================================
DROP POLICY IF EXISTS "patient_therapists participants" ON patient_therapists;
CREATE POLICY "patient_therapists participants" ON patient_therapists
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "therapistId" = auth.uid()::text
    OR "patientId" = auth.uid()::text
  );

-- ============================================================
-- programs: creator of patiënt zelf, plus same-practice therapist
-- ============================================================
DROP POLICY IF EXISTS "programs creator or patient" ON programs;
CREATE POLICY "programs creator or patient" ON programs
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "creatorId" = auth.uid()::text
    OR "patientId" = auth.uid()::text
  );

-- ============================================================
-- week_schedules: idem
-- ============================================================
DROP POLICY IF EXISTS "week_schedules creator or patient" ON week_schedules;
CREATE POLICY "week_schedules creator or patient" ON week_schedules
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "creatorId" = auth.uid()::text
    OR "patientId" = auth.uid()::text
  );

-- ============================================================
-- session_logs + wellness_checks: eigen data of linked therapist
-- ============================================================
DROP POLICY IF EXISTS "session_logs own or therapist" ON session_logs;
CREATE POLICY "session_logs own or therapist" ON session_logs
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "patientId" = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM patient_therapists pt
      WHERE pt."patientId" = session_logs."patientId"
        AND pt."therapistId" = auth.uid()::text
        AND pt."isActive" = true
        AND pt.status = 'APPROVED'
    )
  );

DROP POLICY IF EXISTS "wellness_checks own or therapist" ON wellness_checks;
CREATE POLICY "wellness_checks own or therapist" ON wellness_checks
  FOR SELECT
  USING (
    auth.user_role() = 'ADMIN'
    OR "userId" = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM patient_therapists pt
      WHERE pt."patientId" = wellness_checks."userId"
        AND pt."therapistId" = auth.uid()::text
        AND pt."isActive" = true
        AND pt.status = 'APPROVED'
    )
  );

-- Let op: favorite_exercises + exercise_collections + favoriteExercise
-- blijven user-scoped zonder practice-filter — ze zijn per-user persoonlijk.
