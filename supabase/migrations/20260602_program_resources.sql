-- Educatie-blokken in de program-builder (ProgramResource) — RLS
-- ───────────────────────────────────────────────────────────────
-- Tabel-DDL komt via `prisma db push` (model ProgramResource). Deze migratie
-- zet enkel RLS: alle app-reads/-writes lopen via Prisma (service_role, bypasst
-- RLS), dus deny-all volstaat en sluit directe anon/REST-toegang af, conform
-- AGENTS.md.
--
-- Idempotent.

ALTER TABLE public.program_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_resources_default_deny" ON public.program_resources;
CREATE POLICY "program_resources_default_deny" ON public.program_resources
  FOR ALL TO public USING (false) WITH CHECK (false);
