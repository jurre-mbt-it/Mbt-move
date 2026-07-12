-- ============================================================================
-- MBT Gym — RLS aan op shop_access_requests
-- File: supabase/migrations/20260712_shop_access_requests_rls.sql
-- ============================================================================
-- Nieuwe public-tabel (via `prisma db push`) voor account-aanvragen vanuit de
-- shop. Bevat NAW-lite (naam + e-mail) van prospects → nooit direct leesbaar
-- via de anon-key. Conform AGENTS.md: elke nieuwe public-tabel krijgt RLS +
-- default_deny in dezelfde wijziging. Prisma draait als owner en bypasst RLS,
-- dus deny-all volstaat voor de app-flow.
--
-- Idempotent: opnieuw runnen is veilig.
-- ============================================================================

ALTER TABLE public.shop_access_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_access_requests'
      AND policyname = 'default_deny'
  ) THEN
    CREATE POLICY "default_deny" ON public.shop_access_requests
      FOR ALL TO public USING (false) WITH CHECK (false);
  END IF;
END $$;
