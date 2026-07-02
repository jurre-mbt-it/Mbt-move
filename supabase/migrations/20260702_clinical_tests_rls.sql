-- Clinical Tests library + patient test-toewijzing/-resultaten — RLS
-- ──────────────────────────────────────────────────────────────────
-- Tabel-DDL kwam via `prisma db push` (modellen ClinicalTest,
-- PatientTestAssignment, PatientTestResult, commit 1e555e6 van 2026-05-24) —
-- drie dagen NA de force-RLS-migratie 20260521, waardoor deze tabellen nooit
-- een eigen RLS-migratie kregen (het gat dat AGENTS.md al beschrijft).
-- `patient_test_results` bevat gezondheidsdata (testscores, LSI, pijnscore),
-- dus zonder RLS zijn ze rechtstreeks leesbaar via de anon-key op de Supabase
-- REST-API.
--
-- Alle app-reads gaan via Prisma met de service_role en bypassen RLS; deze
-- policies sluiten enkel directe anon/authenticated REST-toegang af, conform
-- AGENTS.md ("RLS op elke nieuwe tabel").
--
-- Idempotent: ENABLE is herhaalbaar; policies worden eerst gedropt voor recreate.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clinical_tests',
    'patient_test_assignments',
    'patient_test_results'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_default_deny', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO public USING (false) WITH CHECK (false);',
      t || '_default_deny', t
    );
  END LOOP;
END $$;
