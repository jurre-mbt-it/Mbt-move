-- Dag-belasting uit continue hartslag ("exertion"): Edwards-TRIMP over het hele
-- etmaal, inclusief workout-minuten. Los van stress_entries, die juist alleen
-- de rust-periodes meet.

CREATE TABLE IF NOT EXISTS "exertion_entries" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL,
  "trimp"       INTEGER NOT NULL,
  "activeSec"   INTEGER NOT NULL,
  "timeInZones" JSONB NOT NULL,
  "hrHistogram" JSONB,
  "maxHrUsed"   INTEGER,
  "source"      "WorkoutSource" NOT NULL DEFAULT 'APPLE_WATCH',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exertion_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exertion_entries_userId_date_idx" ON "exertion_entries"("userId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "exertion_entries_userId_date_key" ON "exertion_entries"("userId", "date");

DO $$ BEGIN
  ALTER TABLE "exertion_entries" ADD CONSTRAINT "exertion_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS: Prisma draait als owner en bypasst RLS, dus deny-all volstaat. De
-- anon-key mag deze tabel nooit rechtstreeks kunnen lezen/schrijven.
ALTER TABLE public.exertion_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.exertion_entries;
CREATE POLICY "default_deny" ON public.exertion_entries
  FOR ALL TO public USING (false) WITH CHECK (false);
