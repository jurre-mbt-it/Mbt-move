-- Cardio-workout (blokkenbouwer) per programmadag, sleutel "w1d2" zoals
-- programs.groups (zie 20260913_programma_blokken.sql). Additief: oudere
-- lezers negeren de kolom, de runner leest hem per dag uit.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS "cardioByDay" JSONB;
