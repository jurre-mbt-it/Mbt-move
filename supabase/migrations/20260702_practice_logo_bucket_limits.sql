-- Practice-logos bucket: server-side mime/size-limieten
-- ──────────────────────────────────────────────────────
-- De bucket is public-read en de type/grootte-checks zaten alleen in de
-- browser. Een ingelogde therapeut kan de client omzeilen en direct via de
-- Supabase Storage REST-API uploaden — bv. een SVG-met-<script> of een enorm
-- bestand. Storage-RLS beperkt WIE mag uploaden (eigen practiceId-prefix), maar
-- niet WAT. Deze limieten dwingen dat server-side af:
--   - allowed_mime_types: alleen raster-afbeeldingen (geen SVG → geen script).
--   - file_size_limit: 2 MB, gelijk aan de client-check.
--
-- Idempotent: UPDATE op de bestaande bucket-rij.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'],
  file_size_limit = 2097152  -- 2 MB
WHERE id = 'practice-logos';
