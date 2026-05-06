-- ============================================================================
-- MBT Move — cohort_analytics_opt_out kolom op users
-- File: supabase/migrations/20260506_cohort_analytics_opt_out.sql
-- ============================================================================
-- Doel: documentatie van de schema-change die via `prisma db push` is gedaan
-- toen we de `cohortAnalyticsOptOut` boolean toevoegden aan de User.
-- Patient/athlete kan zichzelf via deze flag uitsluiten van platform-aggregaten
-- in `/therapist/cohort` en `/admin/cohort`.
--
-- Idempotent: gebruikt IF NOT EXISTS / CHECK om opnieuw veilig te runnen.
--
-- RLS: de users-tabel heeft al RLS aan via
-- 20260424_enforce_rls_all_tables.sql, dus geen aparte ALTER TABLE nodig.
-- Prisma draait met service_role en bypasst RLS — alle filtering op deze
-- kolom gebeurt op application-niveau in src/server/routers/cohort.ts.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "cohortAnalyticsOptOut" boolean NOT NULL DEFAULT false;

-- Comment voor toekomstige audit-runs / onboarding nieuwe ontwikkelaars.
COMMENT ON COLUMN public.users."cohortAnalyticsOptOut" IS
  'Patient/athlete opt-out vlag voor platform-aggregaten (cohort dashboards). Default false = meedoen. Onafhankelijk van research-consent (ResearchConsent model) dat export naar derden regelt.';
