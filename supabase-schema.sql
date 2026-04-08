-- MBT Gym — volledige database schema
-- Veilig uitvoeren: overslaat bestaande tabellen en kolommen

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'THERAPIST', 'PATIENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ExerciseCategory" AS ENUM ('STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BodyRegion" AS ENUM ('KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY', 'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaType" AS ENUM ('UPLOAD', 'YOUTUBE', 'VIMEO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Users: add missing columns to existing table ───────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone"         TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dateOfBirth"   TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "specialty"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio"           TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaSecret"     TEXT;

-- ── Exercises ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercises" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "category"        "ExerciseCategory" NOT NULL,
    "bodyRegion"      "BodyRegion"[],
    "difficulty"      "Difficulty" NOT NULL DEFAULT 'BEGINNER',
    "mediaType"       "MediaType",
    "videoUrl"        TEXT,
    "thumbnailUrl"    TEXT,
    "instructions"    TEXT[],
    "tips"            TEXT[],
    "tags"            TEXT[],
    "isPublic"        BOOLEAN NOT NULL DEFAULT false,
    "createdById"     TEXT NOT NULL,
    "easierVariantId" TEXT,
    "harderVariantId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "muscle_loads" (
    "id"         TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "muscle"     TEXT NOT NULL,
    "load"       INTEGER NOT NULL,
    CONSTRAINT "muscle_loads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "muscle_loads_exerciseId_muscle_key" ON "muscle_loads"("exerciseId", "muscle");

CREATE TABLE IF NOT EXISTS "exercise_collections" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "color"       TEXT,
    "therapistId" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exercise_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "exercise_collection_items" (
    "id"           TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "exerciseId"   TEXT NOT NULL,
    "addedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exercise_collection_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_collection_items_collectionId_exerciseId_key" ON "exercise_collection_items"("collectionId", "exerciseId");

-- ── Programs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "programs" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "status"      "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "isTemplate"  BOOLEAN NOT NULL DEFAULT false,
    "weeks"       INTEGER NOT NULL DEFAULT 4,
    "daysPerWeek" INTEGER NOT NULL DEFAULT 3,
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "creatorId"   TEXT NOT NULL,
    "patientId"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "program_exercises" (
    "id"            TEXT NOT NULL,
    "programId"     TEXT NOT NULL,
    "exerciseId"    TEXT NOT NULL,
    "week"          INTEGER NOT NULL DEFAULT 1,
    "day"           INTEGER NOT NULL DEFAULT 1,
    "order"         INTEGER NOT NULL DEFAULT 0,
    "sets"          INTEGER NOT NULL DEFAULT 3,
    "reps"          INTEGER NOT NULL DEFAULT 10,
    "repUnit"       TEXT NOT NULL DEFAULT 'reps',
    "restTime"      INTEGER NOT NULL DEFAULT 60,
    "supersetGroup" TEXT,
    "supersetOrder" INTEGER NOT NULL DEFAULT 0,
    "notes"         TEXT,
    CONSTRAINT "program_exercises_pkey" PRIMARY KEY ("id")
);

-- ── Sessions & logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session_logs" (
    "id"            TEXT NOT NULL,
    "programId"     TEXT NOT NULL,
    "patientId"     TEXT NOT NULL,
    "status"        "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt"   TIMESTAMP(3) NOT NULL,
    "completedAt"   TIMESTAMP(3),
    "duration"      INTEGER,
    "notes"         TEXT,
    "painLevel"     INTEGER,
    "exertionLevel" INTEGER,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "exercise_logs" (
    "id"            TEXT NOT NULL,
    "sessionId"     TEXT NOT NULL,
    "exerciseId"    TEXT NOT NULL,
    "setsCompleted" INTEGER,
    "repsCompleted" INTEGER,
    "duration"      INTEGER,
    "notes"         TEXT,
    "painLevel"     INTEGER,
    CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "type"      TEXT NOT NULL,
    "data"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "messages" (
    "id"          TEXT NOT NULL,
    "senderId"    TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "patient_therapists" (
    "id"          TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "patientId"   TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "notes"       TEXT,
    CONSTRAINT "patient_therapists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "patient_therapists_therapistId_patientId_key" ON "patient_therapists"("therapistId", "patientId");

-- ── Foreign keys (only if tables were just created) ───────────────────────────
DO $$ BEGIN
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_easierVariantId_fkey" FOREIGN KEY ("easierVariantId") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_harderVariantId_fkey" FOREIGN KEY ("harderVariantId") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "muscle_loads" ADD CONSTRAINT "muscle_loads_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercise_collections" ADD CONSTRAINT "exercise_collections_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercise_collection_items" ADD CONSTRAINT "exercise_collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "exercise_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercise_collection_items" ADD CONSTRAINT "exercise_collection_items_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "programs" ADD CONSTRAINT "programs_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "programs" ADD CONSTRAINT "programs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_therapists" ADD CONSTRAINT "patient_therapists_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_therapists" ADD CONSTRAINT "patient_therapists_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Week Schedules (Fase 4)
CREATE TABLE IF NOT EXISTS "week_schedules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "creatorId" TEXT NOT NULL,
  "patientId" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isTemplate" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "week_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "week_schedule_days" (
  "id" TEXT NOT NULL,
  "weekScheduleId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "programId" TEXT,
  CONSTRAINT "week_schedule_days_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "week_schedules" ADD CONSTRAINT "week_schedules_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "week_schedules" ADD CONSTRAINT "week_schedules_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "week_schedule_days" ADD CONSTRAINT "week_schedule_days_weekScheduleId_fkey" FOREIGN KEY ("weekScheduleId") REFERENCES "week_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "week_schedule_days" ADD CONSTRAINT "week_schedule_days_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
