-- ============================================================================
-- ProgramType enum uitbreiden met 3 waarden zodat programma-categorieën 1-op-1
-- matchen met Exercise categorieën (Kracht / Mobiliteit / Plyometrie / Cardio
-- / Stabiliteit).
-- File: supabase/migrations/20260424_program_type_expand.sql
-- ============================================================================
-- Idempotent via `IF NOT EXISTS`; veilig om herhaaldelijk te draaien.
-- Let op: Postgres staat niet toe dat je in dezelfde transactie een nieuwe
-- enum-waarde toevoegt én direct gebruikt. Daarom ALLEEN deze ALTERs hier.
-- ============================================================================

ALTER TYPE "ProgramType" ADD VALUE IF NOT EXISTS 'MOBILITY';
ALTER TYPE "ProgramType" ADD VALUE IF NOT EXISTS 'PLYOMETRICS';
ALTER TYPE "ProgramType" ADD VALUE IF NOT EXISTS 'STABILITY';
