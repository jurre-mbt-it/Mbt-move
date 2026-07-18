-- Opmerking per loopmetric in de hardloopanalyse: { cadence: "…", … }.
-- Additieve, nullable JSONB-kolom — geen RLS-wijziging nodig (running_analyses
-- heeft al RLS + policies). Zo kan de therapeut ook bij de loopmetrics per test
-- een opmerking plaatsen, niet alleen in de slottekst onderaan.
ALTER TABLE public.running_analyses
  ADD COLUMN IF NOT EXISTS "metricComments" JSONB;
