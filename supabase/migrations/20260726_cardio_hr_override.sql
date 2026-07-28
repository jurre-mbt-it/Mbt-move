-- Handmatig gecorrigeerde hartslag op een gesyncte cardio-sessie.
--
-- Een optische polssensor kan vastlopen (een hele rit exact dezelfde bpm) of
-- op de cadans locken. De gesyncte HR is dan onbruikbaar, maar corrigeren had
-- geen zin: de eerstvolgende sync van dezelfde workout (anchor-reset,
-- herinstallatie, Strava-hersync) zette de foute waarden terug.
--
-- Is deze kolom gevuld, dan laten alle sync-paden de HR-velden met rust:
-- avgHeartRate, maxHeartRate, series, timeInZones en de uit HR afgeleide rpe.

ALTER TABLE "cardio_logs" ADD COLUMN IF NOT EXISTS "hrOverriddenAt" TIMESTAMP(3);
