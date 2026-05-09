-- Fix: storage-policy voor practice-logos matchte op users.id, terwijl
-- auth.uid() de Supabase auth-UUID retourneert die in users.supabaseUserId
-- staat. Resultaat: "new row violates row-level security policy" bij upload.
--
-- Deze migratie vervangt de policy door een variant die op supabaseUserId
-- matcht (met fallback naar users.id voor legacy rows zonder supabaseUserId).

DROP POLICY IF EXISTS "logo_upload_practice_owner" ON storage.objects;
CREATE POLICY "logo_upload_practice_owner" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'practice-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE (u."supabaseUserId" = auth.uid()::text OR u.id = auth.uid()::text)
        AND u."isPracticeOwner" = true
        AND u."practiceId" = SPLIT_PART(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'practice-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE (u."supabaseUserId" = auth.uid()::text OR u.id = auth.uid()::text)
        AND u."isPracticeOwner" = true
        AND u."practiceId" = SPLIT_PART(name, '/', 1)
    )
  );
