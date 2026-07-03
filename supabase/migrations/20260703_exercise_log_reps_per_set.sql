-- Reps per set op gelogde oefeningen: de sessie-runner laat reps per set
-- afwijken (bv. 10/10/8), analoog aan "weightsPerSet". Vorm: [number|null, ...]
-- met één entry per set.
-- Idempotent (IF NOT EXISTS) zodat het veilig naast `prisma db push` kan draaien.
-- Geen RLS-wijziging nodig: bestaande tabel, alleen een nullable kolom.

ALTER TABLE public.exercise_logs
  ADD COLUMN IF NOT EXISTS "repsPerSet" jsonb;
