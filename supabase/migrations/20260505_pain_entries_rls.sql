-- ============================================================================
-- MBT Move — RLS aan op pain_entries
-- File: supabase/migrations/20260505_pain_entries_rls.sql
-- ============================================================================
-- De `pain_entries` tabel is via `prisma db push` toegevoegd zonder dat de
-- RLS-policy mee kwam. Zonder deze migratie verschijnt 'ie als
-- "Unrestricted" in Supabase Studio. Deze migratie sluit dat gat conform
-- 20260424_enforce_rls_all_tables.sql.
--
-- Effect: anon/authenticated rollen kunnen niets meer met de tabel (deny-all).
-- Prisma draait met service_role en blijft ongestoord werken — zie memory
-- project_rls_prisma_role voor de follow-up om Prisma als authenticated te
-- laten draaien zodat policies écht actief worden.
--
-- Idempotent: opnieuw runnen is veilig.
-- ============================================================================

ALTER TABLE public.pain_entries ENABLE ROW LEVEL SECURITY;
