-- Polar AccessLink-koppeling: enum-waarden + connectie-tabel + RLS.
-- Idempotent zodat 'm veilig opnieuw draaien kan.

ALTER TYPE "WorkoutSource" ADD VALUE IF NOT EXISTS 'POLAR';
ALTER TYPE "WearableProvider" ADD VALUE IF NOT EXISTS 'POLAR';

CREATE TABLE IF NOT EXISTS "polar_connections" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "polarUserId"        TEXT NOT NULL,
  "memberId"           TEXT NOT NULL,
  "accessToken"        TEXT NOT NULL,
  "expiresAt"          TIMESTAMP(3) NOT NULL,
  "needsReauth"        BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt"         TIMESTAMP(3),
  "lastWellnessSyncAt" TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "polar_connections_userId_key" ON "polar_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "polar_connections_polarUserId_key" ON "polar_connections"("polarUserId");
CREATE INDEX IF NOT EXISTS "polar_connections_polarUserId_idx" ON "polar_connections"("polarUserId");

DO $$ BEGIN
  ALTER TABLE "polar_connections" ADD CONSTRAINT "polar_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS verplicht (anon-key zit in de browserbundle). Prisma draait als owner en
-- bypasst RLS, dus deny-all volstaat.
ALTER TABLE "polar_connections" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "polar_connections"
    FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
