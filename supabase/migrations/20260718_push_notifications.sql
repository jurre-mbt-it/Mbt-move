-- Push-notificaties: token-opslag per device + notificatie-voorkeuren per user.
-- Puur additief (twee nieuwe tabellen), idempotent (IF NOT EXISTS).
--
-- RLS verplicht op elke nieuwe public-tabel: de anon-key zit in de mobiele
-- bundle. Prisma draait als owner en bypasst RLS, dus deny-all volstaat —
-- alle toegang loopt server-side via tRPC met een geverifieerde JWT-context.

-- ── push_tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  "id"         text PRIMARY KEY,
  "userId"     text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "token"      text NOT NULL UNIQUE,
  "platform"   text NOT NULL,
  "deviceName" text,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "push_tokens_user_idx"
  ON public.push_tokens ("userId");

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.push_tokens;
CREATE POLICY "default_deny" ON public.push_tokens
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ── notification_preferences ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  "id"              text PRIMARY KEY,
  "userId"          text NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  "pushEnabled"     boolean NOT NULL DEFAULT true,
  "categories"      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "quietHoursStart" integer,
  "quietHoursEnd"   integer,
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.notification_preferences;
CREATE POLICY "default_deny" ON public.notification_preferences
  FOR ALL TO public USING (false) WITH CHECK (false);
