-- Dagdoelen per gebruiker voor de activiteitsringen in de mobiele app.
-- Elke NULL-kolom = "automatisch" (client rekent de slimme default uit).
-- Puur additief en idempotent (IF NOT EXISTS).
--
-- RLS verplicht op elke nieuwe public-tabel: de anon-key zit in de mobiele
-- bundle. Prisma draait als owner en bypasst RLS, dus deny-all volstaat —
-- alle toegang loopt server-side via tRPC met een geverifieerde JWT-context.

CREATE TABLE IF NOT EXISTS public.daily_goals (
  "id"           text PRIMARY KEY,
  "userId"       text NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  "kcalGoal"     integer,
  "trainMinGoal" integer,
  "stepsGoal"    integer,
  "sleepMinGoal" integer,
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.daily_goals;
CREATE POLICY "default_deny" ON public.daily_goals
  FOR ALL TO public USING (false) WITH CHECK (false);
