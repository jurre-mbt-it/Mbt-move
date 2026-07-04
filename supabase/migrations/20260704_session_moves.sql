-- Sessie verplaatsen: patiënt/atleet schuift een geplande programma-dag
-- binnen de week naar een andere weekdag ("doe ik donderdag"). Eén rij per
-- (patiënt, programma, week, fromDay); verplaatsen overschrijft, terugzetten
-- verwijdert de rij.
-- RLS verplicht op elke nieuwe public-tabel (anon-key zit in de browser-
-- bundle); Prisma draait als owner en bypasst RLS, dus deny-all volstaat.

CREATE TABLE IF NOT EXISTS public.session_moves (
  "id"        text PRIMARY KEY,
  "patientId" text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "programId" text NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  "week"      integer NOT NULL,
  "fromDay"   integer NOT NULL,
  "toDay"     integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "session_moves_patient_program_week_from_key"
  ON public.session_moves ("patientId", "programId", "week", "fromDay");

ALTER TABLE public.session_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.session_moves;
CREATE POLICY "default_deny" ON public.session_moves
  FOR ALL TO public USING (false) WITH CHECK (false);
