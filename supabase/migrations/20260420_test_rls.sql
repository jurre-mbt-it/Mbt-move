-- ============================================================================
-- MBT Move — RLS Verification Tests
-- File: supabase/migrations/20260420_test_rls.sql
-- ============================================================================
-- Run this AFTER the RLS migration to verify policies work as expected.
-- Run as service_role (the Supabase SQL Editor runs as service_role by default,
-- so you must explicitly set the role for each test).
--
-- Usage: paste into Supabase SQL Editor and run section by section.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SETUP: confirm all tables have RLS enabled
-- ----------------------------------------------------------------------------

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  CASE WHEN rowsecurity THEN '✅' ELSE '❌ RLS OFF' END AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity, tablename;

-- Expected: every public table shows rls_enabled = true
-- Any row with ❌ needs ALTER TABLE ... ENABLE ROW LEVEL SECURITY

-- ----------------------------------------------------------------------------
-- CHECK: policy count per table
-- ----------------------------------------------------------------------------

SELECT
  tablename,
  COUNT(*) AS policy_count,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected: anonymous_id_mappings shows 0 (intentional lockdown)
-- All other tables: at least 1 policy

-- ----------------------------------------------------------------------------
-- TEST 1: simulate a PATIENT trying to read another patient's data
-- ----------------------------------------------------------------------------
-- Replace the UUIDs below with actual IDs from your users table.

-- Example user IDs from your screenshot:
-- Alex Rivera (PATIENT):   cmnq1pcav00039rlllhrja3ci
-- Morgan Lee (PATIENT):    cmnq1pcg600049rllh1giwb7v
-- Sarah Chen (THERAPIST):  cmnq1pc4r00019rllzunz8f1u

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cmnq1pcav00039rlllhrja3ci","role":"authenticated"}';

-- Should return: ONLY Alex's own appointments (not Morgan's)
SELECT id, "patientId", "therapistId", "scheduledAt"
FROM public.appointments;

-- Should return: ONLY Alex's own wellness checks
SELECT id, "userId", date, sleep
FROM public.wellness_checks;

-- Should return: 0 rows (patient cannot read anonymous_id_mappings)
SELECT COUNT(*) AS mapping_leak_test
FROM public.anonymous_id_mappings;
-- Expected: 0 — if this returns anything, it's a CRITICAL bug

ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 2: simulate a THERAPIST reading linked patients' data
-- ----------------------------------------------------------------------------

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cmnq1pc4r00019rllzunz8f1u","role":"authenticated"}';

-- Should return: patients linked via patient_therapists where isActive=true
SELECT DISTINCT u.id, u.name, u.role
FROM public.users u
WHERE u.id IN (SELECT "patientId" FROM public.patient_therapists);

-- Should return: all appointments for this therapist
SELECT id, "patientId", "scheduledAt"
FROM public.appointments
WHERE "therapistId" = 'cmnq1pc4r00019rllzunz8f1u';

ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 3: simulate ATHLETE vs PATIENT parity
-- ----------------------------------------------------------------------------
-- Athletes should have the same baseline access as patients (via is_client()).

BEGIN;
SET LOCAL ROLE authenticated;
-- Jurre test (ATHLETE):
SET LOCAL request.jwt.claims = '{"sub":"c329f19b-50a7-4225-8c13-fff66397442e","role":"authenticated"}';

-- Should return: only own wellness checks
SELECT COUNT(*) AS own_checks
FROM public.wellness_checks
WHERE "userId" = 'c329f19b-50a7-4225-8c13-fff66397442e';

-- Should return: only own programs (as patientId)
SELECT COUNT(*) AS own_programs
FROM public.programs
WHERE "patientId" = 'c329f19b-50a7-4225-8c13-fff66397442e';

ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 4: verify anonymous_id_mappings is completely locked
-- ----------------------------------------------------------------------------

BEGIN;
SET LOCAL ROLE authenticated;
-- Admin user:
SET LOCAL request.jwt.claims = '{"sub":"cmnq1pc1n00009rll1qoleh84","role":"authenticated"}';

-- Even admins cannot read via RLS — this must return 0 rows
SELECT COUNT(*) AS admin_mapping_access
FROM public.anonymous_id_mappings;
-- Expected: 0
-- If admins NEED access, do it via a backend service_role route, not via RLS

ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 5: helper functions sanity check
-- ----------------------------------------------------------------------------

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80821a2d-f29f-4664-8435-466869ab9e9f","role":"authenticated"}';
-- This is Jurre Kok (THERAPIST)

SELECT
  public.current_role()    AS role,       -- expected: THERAPIST
  public.is_admin()        AS is_admin,   -- expected: false
  public.is_therapist()    AS is_therapist, -- expected: true
  public.is_client()       AS is_client;  -- expected: false

ROLLBACK;

-- ============================================================================
-- END OF TESTS
-- ============================================================================
