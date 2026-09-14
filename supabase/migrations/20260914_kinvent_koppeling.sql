-- Kinvent-koppeling: tabellen, kolommen, indexen en RLS (2026-09-14).
--
-- Vervangt 20260820_kinvent_koppeling.sql en 20260820_kinvent_connection.sql,
-- die alleen RLS zetten en de tabellen aan `prisma db push` overlieten. Op
-- productie draaien we geen push; dit bestand is compleet en idempotent, dus
-- opnieuw draaien is veilig. DDL gegenereerd met `prisma migrate diff` tegen
-- main, daarna met IF NOT EXISTS beschermd.
--
-- Draaien:  set -a; source .env.local; set +a
--           npx prisma db execute --file supabase/migrations/20260914_kinvent_koppeling.sql
--
-- Eenheden in kinvent_jump_*: Kinvents gedocumenteerde sprongmodel, dus kracht
-- in Newton, vermogen in Watt, hoogte in cm, tijd in ms, massa in kg.

-- Koppeling op de patiënt: alleen de participant-code, geen persoonsgegevens.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "kinventParticipantCode" TEXT,
  ADD COLUMN IF NOT EXISTS "kinventLinkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kinventLinkedById" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_kinventParticipantCode_key"
  ON public.users ("kinventParticipantCode");

-- Herkomst op een testrapportregel. Leeg = handmatig, en dat blijft de norm.
ALTER TABLE public.test_report_entries
  ADD COLUMN IF NOT EXISTS "kinventProtocolCode" TEXT,
  ADD COLUMN IF NOT EXISTS "kinventActivityCode" TEXT,
  ADD COLUMN IF NOT EXISTS "kinventRepCode" TEXT,
  ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "importedUnit" TEXT;
-- NULLs tellen als verschillend, dus handmatige regels blijven onbeperkt naast
-- elkaar bestaan; alleen dezelfde Kinvent-meting twee keer in één rapport niet.
CREATE UNIQUE INDEX IF NOT EXISTS "test_report_entries_reportId_kinventActivityCode_key"
  ON public.test_report_entries ("reportId", "kinventActivityCode");

CREATE TABLE IF NOT EXISTS public.kinvent_syncs (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "lastUpdatedAfter" BIGINT NOT NULL DEFAULT 0,
  "lastSyncAt"       TIMESTAMP(3),
  "lastError"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kinvent_syncs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_syncs_patientId_key" ON public.kinvent_syncs ("patientId");

CREATE TABLE IF NOT EXISTS public.kinvent_jump_results (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "protocolCode"     TEXT NOT NULL,
  "activityCode"     TEXT NOT NULL,
  "performedAt"      TIMESTAMP(3) NOT NULL,
  "jumpType"         TEXT,
  "variant"          TEXT NOT NULL DEFAULT 'SINGLE',
  "bodyWeightKg"     DOUBLE PRECISION,
  "gravityRatio"     DOUBLE PRECISION,
  "numberOfJumps"    INTEGER,
  "peakJumpHeightCm" DOUBLE PRECISION,
  "heightAverageCm"  DOUBLE PRECISION,
  "rsi"              DOUBLE PRECISION,
  "mrsi"             DOUBLE PRECISION,
  "fatigueIndex"     DOUBLE PRECISION,
  "importedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kinvent_jump_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_jump_results_protocolCode_key"
  ON public.kinvent_jump_results ("protocolCode");
CREATE INDEX IF NOT EXISTS "kinvent_jump_results_patientId_performedAt_idx"
  ON public.kinvent_jump_results ("patientId", "performedAt");

CREATE TABLE IF NOT EXISTS public.kinvent_jump_reps (
  "id"                      TEXT NOT NULL,
  "resultId"                TEXT NOT NULL,
  "ordinal"                 INTEGER NOT NULL,
  "repCode"                 TEXT,
  "side"                    TEXT,
  "jumpHeightCm"            DOUBLE PRECISION,
  "jumpHeightByVelocityCm"  DOUBLE PRECISION,
  "flightTimeMs"            DOUBLE PRECISION,
  "contactTimeMs"           DOUBLE PRECISION,
  "peakForceN"              DOUBLE PRECISION,
  "peakForceLeftN"          DOUBLE PRECISION,
  "peakForceRightN"         DOUBLE PRECISION,
  "netMaxForceN"            DOUBLE PRECISION,
  "maxPowerW"               DOUBLE PRECISION,
  "rsi"                     DOUBLE PRECISION,
  "timeToStabilizeMs"       DOUBLE PRECISION,
  "propulsiveImpulsePhase1" DOUBLE PRECISION,
  "propulsiveImpulsePhase2" DOUBLE PRECISION,
  CONSTRAINT "kinvent_jump_reps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_jump_reps_resultId_ordinal_key"
  ON public.kinvent_jump_reps ("resultId", "ordinal");

-- Eén aanmelding per praktijk. `token` is AES-256-GCM versleuteld (crypto.ts).
CREATE TABLE IF NOT EXISTS public.kinvent_connections (
  "id"             TEXT NOT NULL,
  "practiceId"     TEXT NOT NULL,
  "token"          TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "connectedById"  TEXT NOT NULL,
  "connectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"     TIMESTAMP(3),
  "lastError"      TEXT,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kinvent_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kinvent_connections_practiceId_key"
  ON public.kinvent_connections ("practiceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_syncs_patientId_fkey') THEN
    ALTER TABLE public.kinvent_syncs ADD CONSTRAINT "kinvent_syncs_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES public.users("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_jump_results_patientId_fkey') THEN
    ALTER TABLE public.kinvent_jump_results ADD CONSTRAINT "kinvent_jump_results_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES public.users("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_jump_reps_resultId_fkey') THEN
    ALTER TABLE public.kinvent_jump_reps ADD CONSTRAINT "kinvent_jump_reps_resultId_fkey"
      FOREIGN KEY ("resultId") REFERENCES public.kinvent_jump_results("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kinvent_connections_practiceId_fkey') THEN
    ALTER TABLE public.kinvent_connections ADD CONSTRAINT "kinvent_connections_practiceId_fkey"
      FOREIGN KEY ("practiceId") REFERENCES public.practices("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS + default_deny op elke nieuwe public-tabel, in dezelfde migratie. Dit
-- zijn meetgegevens van patiënten en een maandlange sleutel tot het
-- Kinvent-account; zonder RLS zijn ze leesbaar via de REST-API met de
-- anon-key uit de browserbundle. Prisma draait als eigenaar met BYPASSRLS.
ALTER TABLE public.kinvent_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_syncs;
CREATE POLICY "default_deny" ON public.kinvent_syncs FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_syncs FROM anon, authenticated;

ALTER TABLE public.kinvent_jump_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_jump_results;
CREATE POLICY "default_deny" ON public.kinvent_jump_results FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_jump_results FROM anon, authenticated;

ALTER TABLE public.kinvent_jump_reps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_jump_reps;
CREATE POLICY "default_deny" ON public.kinvent_jump_reps FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_jump_reps FROM anon, authenticated;

ALTER TABLE public.kinvent_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.kinvent_connections;
CREATE POLICY "default_deny" ON public.kinvent_connections FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kinvent_connections FROM anon, authenticated;
