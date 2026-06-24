-- Programma controle-signaal: optionele looptijd in weken.
-- Null = standaard 8 weken (zie src/lib/program-review.ts). De klok voor het
-- "controleer schema"-signaal telt vanaf programs.updated_at.
-- Additieve kolom op een bestaande tabel — RLS is al actief op public.programs.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS "reviewAfterWeeks" integer;
