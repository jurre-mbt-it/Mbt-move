-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Physitrack-style invite-codes, audit-log, AVG art. 17 soft-delete
-- Date: 2026-04-23
-- ──────────────────────────────────────────────────────────────────────────────
-- Voer uit tegen Supabase:
--   psql $DATABASE_URL -f supabase/migrations/20260423_invite_codes_audit_gdpr.sql
-- of via Supabase dashboard → SQL editor. Kan ook via `npm run db:push` als de
-- Prisma schema al in sync is.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. User: soft-delete + deletion-request velden (AVG art. 17)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON users ("deletedAt");

-- 2. InviteCode tabel — Physitrack-achtige flow
CREATE TABLE IF NOT EXISTS invite_codes (
  id              TEXT PRIMARY KEY,
  "codeHash"      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  "dateOfBirth"   TIMESTAMP(3) NOT NULL,
  role            "UserRole" NOT NULL DEFAULT 'PATIENT',
  "practiceId"    TEXT REFERENCES practices(id) ON DELETE SET NULL,
  "invitedById"   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "usedAt"        TIMESTAMP(3),
  "usedByUserId"  TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "invite_codes_email_idx"       ON invite_codes (email);
CREATE INDEX IF NOT EXISTS "invite_codes_invitedById_idx" ON invite_codes ("invitedById");
CREATE INDEX IF NOT EXISTS "invite_codes_expiresAt_idx"   ON invite_codes ("expiresAt");

-- 3. AuditLog tabel — AVG art. 32
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  "userId"     TEXT REFERENCES users(id) ON DELETE SET NULL,
  "actorEmail" TEXT,
  event        TEXT NOT NULL,
  resource     TEXT,
  "resourceId" TEXT,
  ip           TEXT,
  "userAgent"  TEXT,
  metadata     JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON audit_logs ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_event_createdAt_idx"  ON audit_logs (event, "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"        ON audit_logs ("createdAt");

-- 4. RLS policies — nieuwe tabellen moeten ook onder RLS, consistent met de rest.
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs   ENABLE ROW LEVEL SECURITY;

-- invite_codes: alleen de therapeut die de invite aanmaakte mag 'm zien (of admins)
DROP POLICY IF EXISTS "invite_codes_select_own"  ON invite_codes;
DROP POLICY IF EXISTS "invite_codes_insert_own"  ON invite_codes;
DROP POLICY IF EXISTS "invite_codes_update_own"  ON invite_codes;
DROP POLICY IF EXISTS "invite_codes_delete_own"  ON invite_codes;

CREATE POLICY "invite_codes_select_own" ON invite_codes
  FOR SELECT USING (
    "invitedById" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

CREATE POLICY "invite_codes_insert_own" ON invite_codes
  FOR INSERT WITH CHECK (
    "invitedById" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

CREATE POLICY "invite_codes_update_own" ON invite_codes
  FOR UPDATE USING (
    "invitedById" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

CREATE POLICY "invite_codes_delete_own" ON invite_codes
  FOR DELETE USING (
    "invitedById" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

-- audit_logs: alleen admins mogen lezen. Inserts gebeuren door service-role (Prisma bypasst RLS).
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_own_select"   ON audit_logs;

CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

-- Patiënt mag zijn eigen audit-entries zien (data-subject rights)
CREATE POLICY "audit_logs_own_select" ON audit_logs
  FOR SELECT USING ("userId" = (auth.jwt() ->> 'sub'));
