-- Educatie-content (video + PDF) — RLS + storage-bucket
-- ─────────────────────────────────────────────────────
-- Tabel-DDL komt via `prisma db push` (model EducationalResource). Deze
-- migratie regelt wat db push NIET doet:
--   1. RLS op educational_resources (deny-all — alle app-reads gaan via Prisma
--      met service_role en bypassen RLS; dit sluit alleen directe anon/REST-
--      toegang af, conform AGENTS.md).
--   2. Privé storage-bucket `educational-resources` voor PDF-uploads.
--   3. Storage-RLS: alleen ADMIN mag uploaden/verwijderen. Lezen gebeurt
--      uitsluitend via server-side signed URLs (service_role bypasst RLS),
--      dus geen publieke/authenticated SELECT-policy.
--
-- Idempotent: policies worden eerst gedropt voor recreate.

-- ── 1. RLS op de tabel ──────────────────────────────────────────────────
ALTER TABLE public.educational_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "educational_resources_default_deny" ON public.educational_resources;
CREATE POLICY "educational_resources_default_deny" ON public.educational_resources
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ── 2. Privé storage-bucket ─────────────────────────────────────────────
-- public=false: PDF's zijn niet zonder auth opvraagbaar. De app serveert ze
-- via tijdelijke signed URLs die server-side met de service_role worden
-- gegenereerd.
INSERT INTO storage.buckets (id, name, public)
VALUES ('educational-resources', 'educational-resources', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ── 3. Storage-RLS: alleen ADMIN mag schrijven ──────────────────────────
DROP POLICY IF EXISTS "education_files_admin_all" ON storage.objects;
CREATE POLICY "education_files_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'educational-resources' AND public.is_admin())
  WITH CHECK (bucket_id = 'educational-resources' AND public.is_admin());
