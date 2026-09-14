-- Atletengroepen: een coach plant één kalender voor een groep en stuurt die
-- naar alle leden (spec docs/superpowers/specs/2026-09-14-atletengroepen-design.md).
-- Additief en idempotent.

DO $$ BEGIN
  CREATE TYPE "AthleteGroupRole" AS ENUM ('OWNER', 'VIEWER', 'PLANNER', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_groups" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "planName"    TEXT,
  "description" TEXT,
  "ownerId"     TEXT NOT NULL,
  "startDate"   TIMESTAMP(3) NOT NULL,
  "endDate"     TIMESTAMP(3),
  "lastSentAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "athlete_groups_ownerId_idx" ON "athlete_groups"("ownerId");
DO $$ BEGIN
  ALTER TABLE "athlete_groups" ADD CONSTRAINT "athlete_groups_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_group_members" (
  "id"         TEXT NOT NULL,
  "groupId"    TEXT NOT NULL,
  "patientId"  TEXT NOT NULL,
  "note"       TEXT,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSentAt" TIMESTAMP(3),
  CONSTRAINT "athlete_group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_group_members_groupId_patientId_key" ON "athlete_group_members"("groupId", "patientId");
CREATE INDEX IF NOT EXISTS "athlete_group_members_patientId_idx" ON "athlete_group_members"("patientId");
DO $$ BEGIN
  ALTER TABLE "athlete_group_members" ADD CONSTRAINT "athlete_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "athlete_group_members" ADD CONSTRAINT "athlete_group_members_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "athlete_group_staff" (
  "id"      TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "role"    "AthleteGroupRole" NOT NULL DEFAULT 'VIEWER',
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_group_staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_group_staff_groupId_userId_key" ON "athlete_group_staff"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "athlete_group_staff_userId_idx" ON "athlete_group_staff"("userId");
DO $$ BEGIN
  ALTER TABLE "athlete_group_staff" ADD CONSTRAINT "athlete_group_staff_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "athlete_group_staff" ADD CONSTRAINT "athlete_group_staff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Groepskalender: weekschema's aan een groep i.p.v. een atleet.
ALTER TABLE "week_schedules" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "week_schedules_groupId_weekNumber_idx" ON "week_schedules"("groupId", "weekNumber");
DO $$ BEGIN
  ALTER TABLE "week_schedules" ADD CONSTRAINT "week_schedules_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Herkomst op de kopie bij de atleet.
ALTER TABLE "week_schedule_day_items"
  ADD COLUMN IF NOT EXISTS "groupId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;
CREATE INDEX IF NOT EXISTS "week_schedule_day_items_groupId_idx" ON "week_schedule_day_items"("groupId");
DO $$ BEGIN
  ALTER TABLE "week_schedule_day_items" ADD CONSTRAINT "week_schedule_day_items_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "athlete_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS verplicht (anon-key zit in de browserbundle); Prisma bypasst als owner.
ALTER TABLE "athlete_groups" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_groups" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "athlete_group_members" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_group_members" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "athlete_group_staff" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "athlete_group_staff" FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
