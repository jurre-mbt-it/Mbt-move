-- RLS + partial unique indexen op patient_care_status (2026-08-03).
--
-- De tabel legt per praktijk (therapeut) of per coach vast dat een patiënt
-- uitbehandeld is. Prisma draait als tabel-eigenaar met BYPASSRLS, dus
-- deny-all volstaat; zie AGENTS.md.
--
-- DRAAIT NA `npx prisma db push`. Die push maakt de tabel zelf aan (en de
-- kolom programs."closedByDischarge"), maar zet géén RLS en negeert partial
-- indexen. Zonder dit bestand is de tabel dus rechtstreeks leesbaar via de
-- Supabase REST-API met de anon-key uit de browserbundle, en kan dezelfde
-- patiënt twee keer uitbehandeld worden gemarkeerd binnen één praktijk.
--
-- Het bestand is idempotent: opnieuw draaien is veilig.

ALTER TABLE public.patient_care_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.patient_care_status;
CREATE POLICY "default_deny" ON public.patient_care_status
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.patient_care_status FROM anon, authenticated;

-- Postgres ziet NULLs als verschillend, dus een gewone @@unique([patientId,
-- practiceId]) laat dubbele rijen toe zodra practiceId leeg is. Prisma kan
-- partial indexen niet uitdrukken en negeert ze bij db push; precedent is
-- users_one_owner_per_practice in 20260510_practice_profile.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_practice"
  ON public.patient_care_status ("patientId", "practiceId") WHERE "practiceId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_status_one_per_coach"
  ON public.patient_care_status ("patientId", "coachId") WHERE "coachId" IS NOT NULL;
