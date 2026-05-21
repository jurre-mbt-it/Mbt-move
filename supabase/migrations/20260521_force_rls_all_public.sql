-- ============================================================================
-- MBT Gym — Forceer RLS aan op ELKE tabel in public (idempotent)
-- File: supabase/migrations/20260521_force_rls_all_public.sql
-- ============================================================================
-- Waarom: Supabase-linter (`rls_disabled_in_public`) waarschuwt dat een tabel
-- zonder RLS publiek leesbaar/schrijfbaar is via de anon/authenticated key.
-- Dit kan gebeuren als `prisma db push` een nieuwe tabel aanmaakt zonder dat
-- de bijbehorende RLS-migratie is gedraaid.
--
-- Wat dit script doet:
--   1. Vindt ALLE tabellen in `public` die RLS uit hebben staan en zet 'm aan.
--   2. Voor elke tabel die RLS aan heeft maar geen policies, zet een
--      `default_deny` policy zodat anon/authenticated écht niks kunnen, en
--      het in Supabase Studio ook netjes als policy zichtbaar is.
--
-- Veilig omdat:
--   - `service_role` (waarmee Prisma in de backend draait) bypasst RLS sowieso.
--   - `ENABLE ROW LEVEL SECURITY` en `CREATE POLICY IF NOT EXISTS`-equivalent
--     zijn idempotent (DO-block checkt vóór create).
--   - Geen DROP. Bestaande policies blijven exact zoals ze zijn.
-- ============================================================================

-- 1) Zet RLS aan op elke tabel die 'm nog uit heeft staan
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname NOT LIKE E'\\_prisma%'  -- skip Prisma's eigen migrations-tabel
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    RAISE NOTICE 'RLS aangezet op public.%', r.tablename;
  END LOOP;
END $$;

-- 2) Voeg default_deny toe op elke RLS-aan-tabel zonder policies
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY "default_deny" ON public.%I FOR ALL TO public USING (false) WITH CHECK (false);',
      r.tablename
    );
    RAISE NOTICE 'default_deny policy toegevoegd op public.%', r.tablename;
  END LOOP;
END $$;
