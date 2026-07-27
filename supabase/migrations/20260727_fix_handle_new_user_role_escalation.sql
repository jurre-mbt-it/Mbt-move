-- ============================================================================
-- CRITICAL (audit 2026-07-27): handle_new_user() nam de rol uit
-- `raw_user_meta_data`, en dat is precies wat de aanroeper van
-- /auth/v1/signup als `options.data` meestuurt. Met open signup
-- (disable_signup = false) en mailer_autoconfirm = true kon dus iedereen
-- `signUp({ options: { data: { role: 'ADMIN' } } })` doen en kreeg een
-- public.users-rij met role = ADMIN én id = auth.uid(). is_admin() matcht
-- daarop, en 35 tabellen openen op is_admin() — inclusief
-- patient_assessments, session_logs en wellness_checks.
--
-- Deze migratie haalt de rol uit de client-invoer. De rol komt voortaan uit
-- de server-gemaakte InviteCode voor hetzelfde e-mailadres; is die er niet,
-- dan de laagste rol (PATIENT). De applicatie corrigeert daarna zelf
-- (patients.invitePatient en admin.inviteTherapist schrijven de rol expliciet).
--
-- Tegelijk: search_path pinnen op handle_new_user() en current_role(). De
-- migratie van 27 juli pakte alleen de vier is_*-helpers; deze twee stonden
-- nog op een muteerbare search_path (Supabase-linter 0011).
--
-- Idempotent. NIET auto-uitgerold bij deploy — draai handmatig:
--   npx prisma db execute --file supabase/migrations/20260727_fix_handle_new_user_role_escalation.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  resolved_role public."UserRole";
BEGIN
  -- Rol uit de openstaande, server-gemaakte uitnodiging voor dit adres.
  -- NOOIT uit NEW.raw_user_meta_data: dat is aanvaller-gestuurde invoer.
  SELECT ic.role INTO resolved_role
  FROM public.invite_codes ic
  WHERE lower(ic.email) = lower(NEW.email)
    AND ic."usedAt" IS NULL
    AND ic."expiresAt" > now()
  ORDER BY ic."createdAt" DESC
  LIMIT 1;

  INSERT INTO public.users (id, email, name, role, "createdAt", "updatedAt")
  VALUES (
    NEW.id::text,
    NEW.email,
    -- `name` is cosmetisch en mag wel uit de metadata komen.
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(resolved_role, 'PATIENT'::public."UserRole"),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- current_role() is STABLE SECURITY DEFINER zonder search_path. Zelfde
-- hardening als de is_*-helpers kregen.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'current_role'
      AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn);
  END LOOP;
END $$;
