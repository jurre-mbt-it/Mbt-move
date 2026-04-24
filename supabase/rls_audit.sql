-- ============================================================================
-- MBT Move — RLS audit query
-- File: supabase/rls_audit.sql  (géén migratie — puur diagnostisch)
-- ============================================================================
-- Plak dit in de Supabase SQL Editor om in één oogopslag te zien welke
-- tabellen nog "Unrestricted" staan (RLS uit) of zonder policies draaien.
--
-- Kolommen:
--   tablename        — naam van de tabel
--   rls_enabled      — true = RLS aan, false = "Unrestricted" in Studio
--   policy_count     — aantal RLS-policies op die tabel
--   policy_names     — komma-gescheiden lijst van policy-namen
--   status           — samenvatting (LOCKED / OPEN / NO_POLICIES / OK)
-- ============================================================================

SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  COALESCE(pol.count, 0) AS policy_count,
  COALESCE(pol.names, '') AS policy_names,
  CASE
    WHEN NOT c.relrowsecurity THEN '⚠️  UNRESTRICTED (RLS uit — iedereen mag alles)'
    WHEN COALESCE(pol.count, 0) = 0 THEN '🔒 NO_POLICIES (RLS aan, geen policies — deny-all)'
    ELSE '✅ OK'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS count, string_agg(policyname, ', ' ORDER BY policyname) AS names
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = c.relname
) pol ON true
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
ORDER BY c.relrowsecurity ASC, COALESCE(pol.count, 0) ASC, c.relname;
