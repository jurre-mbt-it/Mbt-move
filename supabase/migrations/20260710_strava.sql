-- Strava OAuth 2.0-koppeling: enum-waarden + connectie-tabel + RLS.
-- Idempotent zodat 'm veilig opnieuw draaien kan.

ALTER TYPE "WorkoutSource" ADD VALUE IF NOT EXISTS 'STRAVA';
ALTER TYPE "WearableProvider" ADD VALUE IF NOT EXISTS 'STRAVA';

CREATE TABLE IF NOT EXISTS "strava_connections" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "athleteId"    TEXT NOT NULL,
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "scope"        TEXT,
  "lastSyncAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strava_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strava_connections_userId_key" ON "strava_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "strava_connections_athleteId_key" ON "strava_connections"("athleteId");
CREATE INDEX IF NOT EXISTS "strava_connections_athleteId_idx" ON "strava_connections"("athleteId");

DO $$ BEGIN
  ALTER TABLE "strava_connections" ADD CONSTRAINT "strava_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS verplicht (anon-key zit in de browserbundle). Prisma draait als owner en
-- bypasst RLS, dus deny-all volstaat.
ALTER TABLE "strava_connections" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "strava_connections"
    FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
