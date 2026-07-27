-- ============================================================================
-- Security-hardening (audit 2026-07-27)
--   1) practice-logos: anon-LISTING dichttrekken (praktijk-id-enumeratie).
--   2) SECURITY DEFINER helpers: expliciete search_path zetten.
-- Idempotent. NIET auto-uitgerold bij deploy — draai handmatig:
--   npx prisma db execute --file supabase/migrations/20260727_security_hardening_storage_and_funcs.sql
-- ============================================================================

-- 1) practice-logos is een PUBLIC bucket: downloads via getPublicUrl gaan
--    sowieso buiten RLS om (nodig voor <img> in e-mails). De brede SELECT-policy
--    voegde daar alleen anon-/authenticated-LISTING aan toe, waarmee iedereen
--    `storage.from('practice-logos').list()` kon doen en alle {practiceId}/logo
--    keys — dus alle praktijk-ids — kon opsommen. De app zelf lijst deze bucket
--    niet; verwijderen breekt logo-weergave niet.
DROP POLICY IF EXISTS "logo_public_read" ON storage.objects;

-- 2) is_admin()/is_client()/is_therapist()/is_therapist_of(...) zijn
--    LANGUAGE sql SECURITY DEFINER zonder SET search_path
--    (Supabase-linter: function_search_path_mutable). Pin de search_path zodat
--    objectresolutie niet via een aanvaller-gestuurd schema kan lopen.
--    Loopt over álle overloads die bestaan, ongeacht argument-signatuur.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_admin', 'is_client', 'is_therapist', 'is_therapist_of')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn);
  END LOOP;
END $$;
