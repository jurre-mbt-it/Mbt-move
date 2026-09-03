-- RLS voor kinvent_connections (2026-08-20).
--
-- DRAAIT NA `npx prisma db push`. De tabel bevat het versleutelde JWT van het
-- Kinvent-praktijkaccount. Versleuteld of niet: zonder RLS is de rij leesbaar
-- via de Supabase REST-API met de anon-key uit de browserbundle, en een
-- aanvaller die daarnaast de env te pakken krijgt heeft dan een maandlange
-- sleutel tot het hele Kinvent-account. Prisma draait als eigenaar met
-- BYPASSRLS, dus deny-all volstaat; zie AGENTS.md. Idempotent.

ALTER TABLE public.kinvent_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_connections;
CREATE POLICY "default_deny" ON public.kinvent_connections
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_connections FROM anon, authenticated;
