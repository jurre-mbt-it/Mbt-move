-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: multi-tenant scope op Program + WeekSchedule
-- Date: 2026-04-24
-- ──────────────────────────────────────────────────────────────────────────────
-- Voegt `practiceId` toe aan beide tabellen en backfilled met de practiceId
-- van de creator (zodat bestaande programma's niet plots onbereikbaar worden
-- voor hun eigen maker).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Program
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS "practiceId" TEXT REFERENCES practices(id) ON DELETE SET NULL;

-- Backfill: pak practiceId van de creator
UPDATE programs p
SET "practiceId" = u."practiceId"
FROM users u
WHERE p."creatorId" = u.id
  AND p."practiceId" IS NULL
  AND u."practiceId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "programs_practiceId_idx"             ON programs ("practiceId");
CREATE INDEX IF NOT EXISTS "programs_creatorId_practiceId_idx"   ON programs ("creatorId", "practiceId");

-- 2. WeekSchedule
ALTER TABLE week_schedules
  ADD COLUMN IF NOT EXISTS "practiceId" TEXT REFERENCES practices(id) ON DELETE SET NULL;

UPDATE week_schedules ws
SET "practiceId" = u."practiceId"
FROM users u
WHERE ws."creatorId" = u.id
  AND ws."practiceId" IS NULL
  AND u."practiceId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "week_schedules_practiceId_idx"             ON week_schedules ("practiceId");
CREATE INDEX IF NOT EXISTS "week_schedules_creatorId_practiceId_idx"   ON week_schedules ("creatorId", "practiceId");

-- 3. RLS policies — zorg dat practice-scope ook op DB-niveau afgedwongen kan worden.
--    Bestaande RLS-policies voor programs/week_schedules (uit 20260422_practice_scope_rls.sql)
--    filteren al op basis van creator-relatie; dit commentaar-blok is als documentatie
--    zodat een toekomstige herziening weet dat practiceId nu bestaat.

COMMENT ON COLUMN programs."practiceId" IS
  'Multi-tenant scope. App-layer filtert hierop. NULL = legacy / admin-created.';
COMMENT ON COLUMN week_schedules."practiceId" IS
  'Multi-tenant scope. App-layer filtert hierop. NULL = legacy.';
