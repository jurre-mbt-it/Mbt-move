-- ============================================================================
-- MBT Move — Backfill practiceId op legacy rijen
-- File: supabase/migrations/20260424_backfill_practice_id.sql
-- ============================================================================
-- Context: Phase B (praktijk-groepen) voegde practiceId toe aan users,
-- exercises, programs en week_schedules. Rijen van vóór die migratie hebben
-- practiceId = NULL en zijn daarmee onzichtbaar voor collega-therapeuten
-- binnen dezelfde praktijk. Deze migratie koppelt ze alsnog.
--
-- Veilig om meerdere keren te draaien — updates raken alleen NULL-rijen.
-- ============================================================================

DO $$
DECLARE
  v_practice_id text;
BEGIN
  SELECT id INTO v_practice_id
  FROM public.practices
  WHERE name = 'Movement Based Therapy'
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Geen Practice met naam "Movement Based Therapy" gevonden. Maak die eerst aan via /admin/practices.';
  END IF;

  -- 1. Users (PATIENT, ATHLETE, THERAPIST) zonder praktijk → MBT
  UPDATE public.users
  SET "practiceId" = v_practice_id
  WHERE "practiceId" IS NULL
    AND role IN ('PATIENT', 'ATHLETE', 'THERAPIST');

  -- 2. Programma's zonder praktijk → praktijk van de creator
  UPDATE public.programs p
  SET "practiceId" = u."practiceId"
  FROM public.users u
  WHERE p."creatorId" = u.id
    AND p."practiceId" IS NULL
    AND u."practiceId" IS NOT NULL;

  -- 3. Weekschedules zonder praktijk → praktijk van de creator
  UPDATE public.week_schedules ws
  SET "practiceId" = u."practiceId"
  FROM public.users u
  WHERE ws."creatorId" = u.id
    AND ws."practiceId" IS NULL
    AND u."practiceId" IS NOT NULL;

  -- 4. Niet-publieke oefeningen zonder praktijk → praktijk van de maker.
  --    Publieke oefeningen (globale seed-library) blijven practiceId=NULL.
  UPDATE public.exercises e
  SET "practiceId" = u."practiceId"
  FROM public.users u
  WHERE e."createdById" = u.id
    AND e."practiceId" IS NULL
    AND e."isPublic" = false
    AND u."practiceId" IS NOT NULL;
END $$;
