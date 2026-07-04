-- Berichten tussen patiënt/atleet en behandelend therapeut(en). Eén draad per
-- patiënt; berichten kunnen gekoppeld zijn aan een gelogde sessie en/of
-- oefening. authorId legt vast wie wat schreef.
--
-- Er bestond een legacy `messages`-tabel (senderId/recipientId/content/read)
-- die nooit in gebruik is genomen: er is nooit een verstuur-endpoint geweest,
-- alleen een read in de AVG-export. Die vervangen we — met een guard die hard
-- faalt als er onverwacht tóch data in staat.
--
-- RLS verplicht op elke nieuwe public-tabel (anon-key zit in de browser-
-- bundle); Prisma draait als owner en bypasst RLS, dus deny-all volstaat.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'senderId'
  ) THEN
    IF (SELECT count(*) FROM public.messages) > 0 THEN
      RAISE EXCEPTION 'legacy messages-tabel bevat data — niet automatisch vervangen';
    END IF;
    DROP TABLE public.messages;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.messages (
  "id"           text PRIMARY KEY,
  "patientId"    text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "authorId"     text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "body"         text NOT NULL,
  "sessionLogId" text REFERENCES public.session_logs(id) ON DELETE SET NULL,
  "exerciseId"   text REFERENCES public.exercises(id) ON DELETE SET NULL,
  "readAt"       timestamptz,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);

-- Idempotent voor tabellen die al met de nieuwe vorm bestaan.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS "fromPatient" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "messages_patient_created_idx"
  ON public.messages ("patientId", "createdAt");

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.messages;
CREATE POLICY "default_deny" ON public.messages
  FOR ALL TO public USING (false) WITH CHECK (false);
