-- Hardloopanalyse (2D videoanalyse) — RLS
-- ─────────────────────────────────────────────────────
-- Tabel-DDL komt additief via prisma (modellen RunningAnalysis, *Item, *Advice).
-- Deze migratie zet RLS + deny-all op de nieuwe public-tabellen; alle app-reads
-- gaan via Prisma met service_role en bypassen RLS. Conform AGENTS.md.
-- Idempotent.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'running_analyses',
    'running_analysis_items',
    'running_analysis_advice'
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
