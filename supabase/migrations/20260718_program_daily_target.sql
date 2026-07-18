-- Tendinopathie-dagritme: aantal ISO-rondes per dag op het programma.
-- Puur additief (één nullable kolom), idempotent. Geen nieuwe tabel, dus
-- geen aparte RLS nodig (programs erft de bestaande policy).

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS "dailyTarget" integer;
