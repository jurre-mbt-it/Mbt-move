-- ============================================================================
-- MBT Move — Cohort analytics: omdraaien van opt-out naar opt-in
-- File: supabase/migrations/20260519_cohort_analytics_opt_in.sql
-- ============================================================================
-- AVG art. 9 vereist expliciete toestemming voor het verwerken van bijzondere
-- persoonsgegevens (incl. afgeleide gezondheidsdata in cohort-aggregaten).
-- Het oude `cohortAnalyticsOptOut` veld stond standaard op false (meedoen),
-- wat juridisch wankel is — patiënten moeten actief opt-INnen.
--
-- Migratie-strategie: drop het oude veld, voeg nieuw `cohortAnalyticsOptIn`
-- veld toe met default false (= niet meedoen). Alle bestaande gebruikers
-- moeten opnieuw expliciet aanvinken. Voor de pilot-fase is dit geen
-- probleem (geen productie-gebruikers met deliberate opt-out keuze).
-- ============================================================================

-- Voeg nieuw opt-IN veld toe
ALTER TABLE public.users
  ADD COLUMN "cohortAnalyticsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- Verwijder oude opt-OUT veld
ALTER TABLE public.users
  DROP COLUMN "cohortAnalyticsOptOut";
