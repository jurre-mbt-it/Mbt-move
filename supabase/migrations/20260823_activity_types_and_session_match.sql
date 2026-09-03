-- Activiteitstypen, ruw bron-type en de koppeling meting ↔ krachtsessie (2026-08-23).
--
-- Drie dingen in één migratie, want ze horen bij dezelfde ingest-wijziging:
--
-- 1. Vier activiteitstypen erbij. Alles wat de HealthKit-brug niet kende viel
--    naar OTHER en heette in de app "Cardio" — een hike van 18 km stond zo als
--    "Cardio" in de kalender. Alleen typen die de app ÁNDERS behandelt krijgen
--    een enum-waarde; de staart (padel, tennis) leest straks uit sourceActivity.
-- 2. `sourceActivity`: het ruwe type van de bron ("hiking", "VirtualRide").
--    Zonder dit is een verkeerd gemapte rij niet te repareren zonder hersync,
--    en kost elke nieuwe sport een migratie.
-- 3. `sessionLogId`: een op de watch gestarte krachttraining komt binnen als
--    CardioLog en staat los van de SessionLog met de sets en reps. Dat is
--    dezelfde training, twee keer geteld in de belastingscurve. Uniek, want
--    één meting hoort bij hoogstens één sessie.
--
-- Volgorde: eerst deze migratie, dán de server deployen.

ALTER TYPE "CardioActivity" ADD VALUE IF NOT EXISTS 'HIKING';
ALTER TYPE "CardioActivity" ADD VALUE IF NOT EXISTS 'STRENGTH';
ALTER TYPE "CardioActivity" ADD VALUE IF NOT EXISTS 'HIIT';
ALTER TYPE "CardioActivity" ADD VALUE IF NOT EXISTS 'YOGA';

ALTER TABLE "cardio_logs"
  ADD COLUMN IF NOT EXISTS "sourceActivity" TEXT,
  ADD COLUMN IF NOT EXISTS "sessionLogId"   TEXT;

DO $$ BEGIN
  ALTER TABLE "cardio_logs"
    ADD CONSTRAINT "cardio_logs_sessionLogId_fkey"
    FOREIGN KEY ("sessionLogId") REFERENCES "session_logs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cardio_logs_sessionLogId_key"
  ON "cardio_logs"("sessionLogId");

-- Het matchen zoekt sessies van één patiënt rond een tijdstip; zonder deze
-- index is dat een seq scan over alle sessies bij elke binnenkomende workout.
CREATE INDEX IF NOT EXISTS "session_logs_patientId_completedAt_idx"
  ON "session_logs"("patientId", "completedAt");
