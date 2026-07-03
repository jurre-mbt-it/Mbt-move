-- ============================================================================
-- MBT Move — Geheimhoudingsverklaring (GHV): in-app acceptatie door therapeuten
-- File: supabase/migrations/20260703_ghv_acceptance.sql
-- ============================================================================
-- Twee additieve nullable kolommen op users, gespiegeld aan de bestaande
-- dpaAccepted*-velden. Therapeuten accepteren de geheimhoudingsverklaring
-- in-app vóór ze dossier-toegang krijgen (gate in require-role.ts); het
-- getekende papieren exemplaar blijft het primaire juridische stuk.
-- Geen RLS-wijziging nodig: users heeft al RLS + policies.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "ghvAcceptedVersion" TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "ghvAcceptedAt" TIMESTAMP(3);
