-- Testrapport (Return to Sport / voortgangsmeting) — RLS
-- ─────────────────────────────────────────────────────
-- Tabel-DDL komt via `prisma db push` (modellen TestCatalogItem, TestBattery,
-- TestBatteryItem, TestReport, TestReportEntry, TestReportAdvice). Deze migratie
-- regelt wat db push NIET doet: RLS aanzetten met een deny-all policy op elke
-- nieuwe public-tabel. Alle app-reads gaan via Prisma met de service_role en
-- bypassen RLS; deze policies sluiten enkel directe anon/authenticated REST-
-- toegang af, conform AGENTS.md ("RLS op elke nieuwe tabel").
--
-- Idempotent: ENABLE is herhaalbaar; policies worden eerst gedropt voor recreate.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'test_catalog_items',
    'test_batteries',
    'test_battery_items',
    'test_reports',
    'test_report_entries',
    'test_report_advice'
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
