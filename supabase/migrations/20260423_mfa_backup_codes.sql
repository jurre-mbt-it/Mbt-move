-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: MFA backup-codes + enforcement-velden
-- Date: 2026-04-23
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. User: MFA enforcement + backup-codes metadata
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "mfaEnforcedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaLastBackupCodesGeneratedAt" TIMESTAMP(3);

-- 2. MfaBackupCode tabel — één-voor-één bruikbare recovery-codes
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "codeHash"  TEXT NOT NULL UNIQUE,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "mfa_backup_codes_userId_idx"          ON mfa_backup_codes ("userId");
CREATE INDEX IF NOT EXISTS "mfa_backup_codes_userId_usedAt_idx"   ON mfa_backup_codes ("userId", "usedAt");

-- 3. RLS — alleen eigenaar mag z'n eigen backup-codes zien/aanmaken
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mfa_backup_codes_select_own" ON mfa_backup_codes;
DROP POLICY IF EXISTS "mfa_backup_codes_insert_own" ON mfa_backup_codes;
DROP POLICY IF EXISTS "mfa_backup_codes_update_own" ON mfa_backup_codes;
DROP POLICY IF EXISTS "mfa_backup_codes_delete_own" ON mfa_backup_codes;

CREATE POLICY "mfa_backup_codes_select_own" ON mfa_backup_codes
  FOR SELECT USING (
    "userId" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );

CREATE POLICY "mfa_backup_codes_insert_own" ON mfa_backup_codes
  FOR INSERT WITH CHECK (
    "userId" = (auth.jwt() ->> 'sub')
  );

CREATE POLICY "mfa_backup_codes_update_own" ON mfa_backup_codes
  FOR UPDATE USING (
    "userId" = (auth.jwt() ->> 'sub')
  );

CREATE POLICY "mfa_backup_codes_delete_own" ON mfa_backup_codes
  FOR DELETE USING (
    "userId" = (auth.jwt() ->> 'sub')
    OR (SELECT role FROM users WHERE id = (auth.jwt() ->> 'sub')) = 'ADMIN'
  );
