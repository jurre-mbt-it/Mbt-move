-- ============================================================================
-- MBT Move — Enforce RLS op alle tabellen (idempotent)
-- File: supabase/migrations/20260424_enforce_rls_all_tables.sql
-- ============================================================================
-- Doel: elke tabel die in Prisma bestaat ook hier expliciet `ENABLE ROW LEVEL
-- SECURITY` geven. Tabellen die via `prisma db push` zijn aangemaakt zonder
-- dat een bijbehorende RLS-migratie is gedraaid, verschijnen in Supabase
-- Studio als "Unrestricted" — dit bestand sluit die gap.
--
-- Herhaalbaar: `ENABLE ROW LEVEL SECURITY` is idempotent, dus opnieuw runnen
-- is veilig. Policies worden hier NIET aangeraakt — die staan in de eerder
-- gedraaide migraties (20260420_enable_rls, 20260422_practice_scope_rls,
-- 20260422_practices_rls, 20260423_*, 20260424_mobility_assessments,
-- 20260424_rehab_protocols, 20260424_practice_scope_program_weekschedule,
-- 20260501_clinical_insight_engine).
--
-- Voor tabellen die nog geen policies hebben wordt RLS-aan effectief
-- `deny-all` voor anon/authenticated-rollen; de backend werkt ongestoord
-- omdat Prisma met service_role draait (bypasst RLS). Zie memory
-- project_rls_prisma_role voor de follow-up.
-- ============================================================================

-- Core identiteit & relaties
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_backup_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_therapists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practices              ENABLE ROW LEVEL SECURITY;

-- Invite + audit + GDPR
ALTER TABLE public.invite_codes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_id_mappings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymized_records     ENABLE ROW LEVEL SECURITY;

-- Oefeningen & catalogus
ALTER TABLE public.exercises                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_loads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_exercises         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_collection_items  ENABLE ROW LEVEL SECURITY;

-- Programma's & schema's
ALTER TABLE public.programs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_exercises    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_schedule_days   ENABLE ROW LEVEL SECURITY;

-- Sessies & logs
ALTER TABLE public.session_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardio_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_checks   ENABLE ROW LEVEL SECURITY;

-- Afspraken & communicatie
ALTER TABLE public.appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;

-- Rehab-protocollen
ALTER TABLE public.rehab_protocols          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_phases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_criteria           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_rehab_trackers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_criterion_status   ENABLE ROW LEVEL SECURITY;

-- Mobility-assessment
ALTER TABLE public.assessment_tests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_test_mobilizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_test_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_archetype_summaries  ENABLE ROW LEVEL SECURITY;

-- Clinical Insight Engine
ALTER TABLE public.patient_insight_status    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_actions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_insight_prefs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_rules             ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Deny-all fallback voor tabellen die RLS aan hebben maar nog géén enkele
-- policy. Postgres weigert dan standaard alles voor anon/authenticated, maar
-- een expliciete policy maakt dat zichtbaar in Supabase Studio (anders blijft
-- de tabel daar verdacht leeg wat policies betreft).
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY "default_deny" ON public.%I FOR ALL TO public USING (false) WITH CHECK (false);',
      r.tablename
    );
  END LOOP;
END $$;
