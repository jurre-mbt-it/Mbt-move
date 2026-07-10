-- Subjectieve beoordeling van een (gesyncte of eigen) cardio-sessie:
-- feelScore (1-5 voldoening/gevoel) + ratedAt (gezet zodra de gebruiker de
-- activiteit heeft beoordeeld). RPE en notes bestaan al. Idempotent.
-- cardio_logs heeft al RLS; extra kolommen vragen geen policy-wijziging.
ALTER TABLE public.cardio_logs ADD COLUMN IF NOT EXISTS "feelScore" integer;
ALTER TABLE public.cardio_logs ADD COLUMN IF NOT EXISTS "ratedAt" timestamp(3);
