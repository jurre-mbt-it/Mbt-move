-- Bronvoorrang op wearable-data: strikt de eerste bron die een dag of nacht
-- levert houdt hem, een tweede bron vult alleen aan wat leeg bleef.
--
-- VitalsEntry draagt twee groepen met verschillende eigenaars: de NACHTgroep
-- (rust-HR, HRV, ademhaling, polstemperatuur) en de DAGgroep (stappen,
-- energie, VO2max). Zonder aparte eigenaar kaapt een middagsync met alleen
-- stappen het label van een rij waarvan de HRV ergens anders vandaan kwam.
--
-- Idempotent zodat 'm veilig opnieuw draaien kan.

ALTER TABLE "vitals_entries" ADD COLUMN IF NOT EXISTS "daySource" "WorkoutSource";

-- `source` wordt de eigenaar van de nachtgroep en mag leeg zijn ("nog
-- niemand"). Stond op NOT NULL DEFAULT 'APPLE_WATCH'.
ALTER TABLE "vitals_entries" ALTER COLUMN "source" DROP NOT NULL;
ALTER TABLE "vitals_entries" ALTER COLUMN "source" DROP DEFAULT;

-- Bestaande rijen komen allemaal van de Apple Watch. Zet het eigenaarschap
-- per groep op wat er feitelijk in staat, zodat een tweede bron die data niet
-- alsnog kan overschrijven.
UPDATE "vitals_entries"
   SET "daySource" = COALESCE("source", 'APPLE_WATCH')
 WHERE "daySource" IS NULL
   AND ("steps" IS NOT NULL OR "activeEnergyKcal" IS NOT NULL
        OR "basalEnergyKcal" IS NOT NULL OR "vo2Max" IS NOT NULL);

UPDATE "vitals_entries"
   SET "source" = NULL
 WHERE "restingHeartRate" IS NULL AND "hrv" IS NULL
   AND "respiratoryRate" IS NULL AND "wristTempDeviation" IS NULL;
