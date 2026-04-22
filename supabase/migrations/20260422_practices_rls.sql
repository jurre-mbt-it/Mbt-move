-- ============================================================================
-- MBT Move — Enable RLS op practices-tabel
-- File: supabase/migrations/20260422_practices_rls.sql
-- ============================================================================
-- De `practices`-tabel is later toegevoegd (multi-tenant Phase B) en werd niet
-- meegenomen in 20260420_enable_rls.sql — Supabase Advisor flagde dit als
-- "rls_disabled_in_public". Policies: users zien hun eigen practice + leeg
-- (legacy NULL), ADMIN ziet alles. Writes gaan via service_role (Prisma).
-- ============================================================================

ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;

-- SELECT: own practice of ADMIN
DROP POLICY IF EXISTS "practices_select" ON public.practices;
CREATE POLICY "practices_select" ON public.practices
  FOR SELECT
  USING (
    public.is_admin()
    OR id = auth.user_practice_id()
  );

-- INSERT/UPDATE/DELETE: alleen ADMIN via authenticated role.
-- (service_role bypasst RLS sowieso, dus Prisma blijft werken.)
DROP POLICY IF EXISTS "practices_manage_admin" ON public.practices;
CREATE POLICY "practices_manage_admin" ON public.practices
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
