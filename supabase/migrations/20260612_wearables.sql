-- Wearables (Apple Watch / HealthKit) — additieve DDL + RLS
-- ─────────────────────────────────────────────────────────
-- De iOS-app leest HealthKit en POST't naar /api/wearable/sync. Deze migratie
-- maakt de nieuwe enums + tabellen en zet RLS + deny-all op elke nieuwe
-- public-tabel (conform AGENTS.md — anon-key zit in de browserbundle).
--
-- Bewust hand-geschreven i.p.v. `prisma db push` om alleen deze feature te
-- raken: een push zou ook losstaande naam-drift op andere tabellen meenemen.
-- Volledig idempotent zodat een latere `prisma db push` hier niet op stuk loopt.

-- ── Enums ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WearableProvider" AS ENUM ('APPLE_HEALTH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkoutSource" AS ENUM ('MANUAL', 'APPLE_WATCH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HrvType" AS ENUM ('SDNN', 'RMSSD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReadinessBand" AS ENUM ('GREEN', 'AMBER', 'RED', 'LEARNING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── cardio_logs: bron + externe id voor dedup ────────────
ALTER TABLE "cardio_logs"
  ADD COLUMN IF NOT EXISTS "source" "WorkoutSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cardio_logs_externalId_key" ON "cardio_logs"("externalId");
CREATE INDEX IF NOT EXISTS "cardio_logs_patientId_completedAt_idx" ON "cardio_logs"("patientId", "completedAt");

-- ── wearable_connections ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "wearable_connections" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "provider"    "WearableProvider" NOT NULL DEFAULT 'APPLE_HEALTH',
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "deviceModel" TEXT,
  "anchors"     JSONB,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wearable_connections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "wearable_connections_userId_idx" ON "wearable_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "wearable_connections_userId_provider_key" ON "wearable_connections"("userId", "provider");

-- ── sleep_entries ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sleep_entries" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "startAt"      TIMESTAMP(3) NOT NULL,
  "endAt"        TIMESTAMP(3) NOT NULL,
  "inBedMin"     INTEGER,
  "asleepMin"    INTEGER NOT NULL,
  "awakeMin"     INTEGER NOT NULL DEFAULT 0,
  "lightMin"     INTEGER NOT NULL DEFAULT 0,
  "deepMin"      INTEGER NOT NULL DEFAULT 0,
  "remMin"       INTEGER NOT NULL DEFAULT 0,
  "efficiency"   DOUBLE PRECISION,
  "latencyMin"   INTEGER,
  "qualityScore" INTEGER,
  "stages"       JSONB,
  "source"       "WorkoutSource" NOT NULL DEFAULT 'APPLE_WATCH',
  "externalId"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sleep_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sleep_entries_externalId_key" ON "sleep_entries"("externalId");
CREATE INDEX IF NOT EXISTS "sleep_entries_userId_date_idx" ON "sleep_entries"("userId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "sleep_entries_userId_date_key" ON "sleep_entries"("userId", "date");

-- ── vitals_entries ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vitals_entries" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "date"               TIMESTAMP(3) NOT NULL,
  "restingHeartRate"   INTEGER,
  "hrv"                DOUBLE PRECISION,
  "hrvType"            "HrvType",
  "respiratoryRate"    DOUBLE PRECISION,
  "wristTempDeviation" DOUBLE PRECISION,
  "source"             "WorkoutSource" NOT NULL DEFAULT 'APPLE_WATCH',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vitals_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vitals_entries_userId_date_idx" ON "vitals_entries"("userId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "vitals_entries_userId_date_key" ON "vitals_entries"("userId", "date");

-- ── readiness_snapshots ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "readiness_snapshots" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "score"        INTEGER NOT NULL,
  "band"         "ReadinessBand" NOT NULL,
  "contributors" JSONB NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "readiness_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "readiness_snapshots_userId_date_idx" ON "readiness_snapshots"("userId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "readiness_snapshots_userId_date_key" ON "readiness_snapshots"("userId", "date");

-- ── Foreign keys (idempotent) ────────────────────────────
DO $$ BEGIN
  ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "sleep_entries" ADD CONSTRAINT "sleep_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "vitals_entries" ADD CONSTRAINT "vitals_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "readiness_snapshots" ADD CONSTRAINT "readiness_snapshots_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── RLS: deny-all op elke nieuwe public-tabel ────────────
-- Prisma draait als owner en bypasst RLS; deny-all sluit de anon-key buiten.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wearable_connections',
    'sleep_entries',
    'vitals_entries',
    'readiness_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_default_deny', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO public USING (false) WITH CHECK (false);',
      t || '_default_deny', t
    );
  END LOOP;
END $$;
