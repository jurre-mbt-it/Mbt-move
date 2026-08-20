-- RLS + indexen voor de Kinvent-koppeling (2026-08-20).
--
-- DRAAIT NA `npx prisma db push`. Die push maakt de tabellen zelf aan en zet de
-- kolommen op users en test_report_entries, maar zet GEEN RLS. Zonder dit
-- bestand zijn kinvent_syncs, kinvent_jump_results en kinvent_jump_reps
-- rechtstreeks leesbaar via de Supabase REST-API met de anon-key uit de
-- browserbundle. Dat zijn meetgegevens van patiënten, dus dat mag niet.
--
-- Prisma draait als tabel-eigenaar met BYPASSRLS, dus deny-all volstaat; zie
-- AGENTS.md. Het bestand is idempotent: opnieuw draaien is veilig.

ALTER TABLE public.kinvent_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_syncs;
CREATE POLICY "default_deny" ON public.kinvent_syncs
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_syncs FROM anon, authenticated;

ALTER TABLE public.kinvent_jump_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_jump_results;
CREATE POLICY "default_deny" ON public.kinvent_jump_results
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_jump_results FROM anon, authenticated;

ALTER TABLE public.kinvent_jump_reps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_jump_reps;
CREATE POLICY "default_deny" ON public.kinvent_jump_reps
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_jump_reps FROM anon, authenticated;

-- De uniciteit op (reportId, kinventActivityCode) staat in schema.prisma en
-- komt dus met de push mee. Een partial index is hier niet nodig: Postgres ziet
-- NULLs als verschillend, dus handmatig ingevoerde regels (kinventActivityCode
-- IS NULL) blijven gewoon onbeperkt naast elkaar bestaan. Alleen een tweede
-- import van dezelfde Kinvent-meting in hetzelfde rapport wordt geweigerd.
