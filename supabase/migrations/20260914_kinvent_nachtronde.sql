-- Kinvent: nachtelijke controle en verloopwaarschuwing (2026-09-14).
-- Idempotent; alleen nieuwe kolommen met standaardwaarde of NULL.

ALTER TABLE public.kinvent_syncs
  ADD COLUMN IF NOT EXISTS "pendingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

ALTER TABLE public.kinvent_connections
  ADD COLUMN IF NOT EXISTS "renewalWarnedAt" TIMESTAMP(3);
