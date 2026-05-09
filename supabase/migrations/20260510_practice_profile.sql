-- Praktijk-profiel + email-footer feature
-- ──────────────────────────────────────────
-- Vereist dat de Prisma-kolommen al bestaan (via `prisma db push`):
--   practices.addressLine1/.../privacyDisclaimer
--   users.firstName, users.lastName, users.jobTitle, users.isPracticeOwner
--
-- Deze migratie regelt:
--   1. Backfill firstName/lastName uit bestaande `name` kolom
--   2. Partial unique index "max één owner per praktijk"
--   3. RLS-policy op practices: owners mogen UPDATE-en (was ADMIN-only)
--   4. Storage bucket `practice-logos` (public read)
--   5. Storage RLS: alleen praktijk-owner mag upload/overschrijven in eigen praktijk-prefix
--
-- Idempotent: alle CREATE'en zijn IF NOT EXISTS / ON CONFLICT, policies worden
-- eerst gedropt voor recreate.

-- ── 1. Backfill firstName/lastName uit name ─────────────────────────────
UPDATE public.users
SET
  "firstName" = TRIM(SPLIT_PART(name, ' ', 1)),
  "lastName"  = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '')
WHERE name IS NOT NULL
  AND TRIM(name) <> ''
  AND "firstName" IS NULL;

-- Edge-case: namen zonder spatie krijgen alleen firstName, geen lastName
UPDATE public.users
SET "firstName" = TRIM(name)
WHERE name IS NOT NULL
  AND TRIM(name) <> ''
  AND POSITION(' ' IN name) = 0
  AND "firstName" IS NULL;

-- ── 2. Eén owner per praktijk ───────────────────────────────────────────
-- Partial unique index: er mag max één row bestaan met (practiceId, isPracticeOwner=true)
-- per practiceId. Andere users (isPracticeOwner=false) tellen niet mee.
DROP INDEX IF EXISTS public.users_one_owner_per_practice;
CREATE UNIQUE INDEX users_one_owner_per_practice
  ON public.users ("practiceId")
  WHERE "isPracticeOwner" = true;

-- ── 3. RLS: owners mogen hun eigen practice UPDATE-en ──────────────────
-- Bestaande policy was ADMIN-only. Nu: ADMIN OF (lid van die practice met
-- isPracticeOwner=true). SELECT-policy blijft zoals 'ie was (eigen practice + admin).
DROP POLICY IF EXISTS "practices_update_admin" ON public.practices;
DROP POLICY IF EXISTS "practices_update_owner_or_admin" ON public.practices;
CREATE POLICY "practices_update_owner_or_admin" ON public.practices
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u."practiceId" = practices.id
        AND u."isPracticeOwner" = true
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u."practiceId" = practices.id
        AND u."isPracticeOwner" = true
    )
  );

-- ── 4. Storage bucket voor logos ────────────────────────────────────────
-- Public bucket: logos worden direct in mail-HTML als <img src> gerenderd,
-- dus ze moeten zonder auth opvraagbaar zijn.
INSERT INTO storage.buckets (id, name, public)
VALUES ('practice-logos', 'practice-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 5. Storage RLS: alleen owner van die praktijk mag upload/replace ────
-- File-naming convention: '{practiceId}/logo.{ext}' — eerste path-segment
-- is de practiceId. Daarmee kan de policy de eigenaar matchen.
DROP POLICY IF EXISTS "logo_upload_practice_owner" ON storage.objects;
CREATE POLICY "logo_upload_practice_owner" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'practice-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u."isPracticeOwner" = true
        AND u."practiceId" = SPLIT_PART(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'practice-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u."isPracticeOwner" = true
        AND u."practiceId" = SPLIT_PART(name, '/', 1)
    )
  );

-- Public read voor logos (anders kunnen mail-clients het plaatje niet laden).
DROP POLICY IF EXISTS "logo_public_read" ON storage.objects;
CREATE POLICY "logo_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'practice-logos');
