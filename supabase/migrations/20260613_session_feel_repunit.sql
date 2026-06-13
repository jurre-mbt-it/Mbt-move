-- Sessie-feedback uitbreiding: subjectieve "Hoe voelde het?"-score op de sessie
-- en het onthouden van de gebruikte reps-eenheid per gelogde oefening.
-- Idempotent (IF NOT EXISTS) zodat het veilig naast `prisma db push` kan draaien.
-- Geen RLS-wijziging nodig: bestaande tabellen, alleen nullable kolommen.

ALTER TABLE public.session_logs
  ADD COLUMN IF NOT EXISTS "feelScore" integer;

ALTER TABLE public.exercise_logs
  ADD COLUMN IF NOT EXISTS "repUnit" text;
