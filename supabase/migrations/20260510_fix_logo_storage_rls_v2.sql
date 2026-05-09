-- Fix v2: vorige policy had een SQL-scope-bug waarbij `split_part(name, '/', 1)`
-- binnen de EXISTS-subquery resolved naar users.name ipv storage.objects.name,
-- omdat de inner FROM users de buitenste `name` kolom schaduwde. Resultaat:
-- policy faalde altijd ("name" was 'Jurre van Putten', niet het file-pad).
--
-- Fix: trek de path-extractie buiten de subquery zodat 'ie eenduidig naar
-- storage.objects.name verwijst. Bonus: leesbaarder.

DROP POLICY IF EXISTS "logo_upload_practice_owner" ON storage.objects;
CREATE POLICY "logo_upload_practice_owner" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'practice-logos'
    AND split_part(storage.objects.name, '/', 1) IN (
      SELECT u."practiceId"
      FROM public.users u
      WHERE (u."supabaseUserId" = auth.uid()::text OR u.id = auth.uid()::text)
        AND u."isPracticeOwner" = true
        AND u."practiceId" IS NOT NULL
    )
  )
  WITH CHECK (
    bucket_id = 'practice-logos'
    AND split_part(storage.objects.name, '/', 1) IN (
      SELECT u."practiceId"
      FROM public.users u
      WHERE (u."supabaseUserId" = auth.uid()::text OR u.id = auth.uid()::text)
        AND u."isPracticeOwner" = true
        AND u."practiceId" IS NOT NULL
    )
  );
