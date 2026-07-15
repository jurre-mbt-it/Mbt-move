-- Plan-sjablonen voor de week-planner (meerweeks, toepasbaar vanaf een datum).
--
-- De inhoud van een sjabloon zijn gewone week_schedules-rijen met
-- isTemplate = true, patient_id = NULL en week_number 1..N, gekoppeld via
-- plan_template_id. Toepassen op een patiënt kopieert die weken (stempel),
-- er blijft geen levende verwijzing achter.
--
-- Idempotent: veilig om opnieuw te draaien.

CREATE TABLE IF NOT EXISTS public.week_plan_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  goal        TEXT,
  weeks       INTEGER NOT NULL DEFAULT 1,
  "creatorId" TEXT NOT NULL,
  "practiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'week_plan_templates_creatorId_fkey'
  ) THEN
    ALTER TABLE public.week_plan_templates
      ADD CONSTRAINT "week_plan_templates_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES public.users(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "week_plan_templates_practiceId_idx"
  ON public.week_plan_templates("practiceId");
CREATE INDEX IF NOT EXISTS "week_plan_templates_creatorId_idx"
  ON public.week_plan_templates("creatorId");

-- Koppeling vanaf de sjabloon-weken.
ALTER TABLE public.week_schedules
  ADD COLUMN IF NOT EXISTS "planTemplateId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'week_schedules_planTemplateId_fkey'
  ) THEN
    ALTER TABLE public.week_schedules
      ADD CONSTRAINT "week_schedules_planTemplateId_fkey"
      FOREIGN KEY ("planTemplateId") REFERENCES public.week_plan_templates(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "week_schedules_planTemplateId_weekNumber_idx"
  ON public.week_schedules("planTemplateId", "weekNumber");

-- RLS verplicht op elke nieuwe public-tabel: de anon-key zit in de
-- browserbundle, dus zonder policy is deze tabel via de REST-API leesbaar
-- buiten de app om. Prisma draait als owner en bypasst RLS, dus deny-all
-- volstaat. Zie AGENTS.md.
ALTER TABLE public.week_plan_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'week_plan_templates'
      AND policyname = 'default_deny'
  ) THEN
    CREATE POLICY "default_deny" ON public.week_plan_templates
      FOR ALL TO public USING (false) WITH CHECK (false);
  END IF;
END $$;
