-- Koppeling tussen protocol-criteria en de test-library.
--
-- Bewust als losse migratie in plaats van `prisma db push`: de live database is
-- gedrift ten opzichte van schema.prisma (de tabel `oura_connections` en de
-- enum-waarde OURA bestaan alleen in de database). Een push zou die tabel
-- DROPpen en de enum-waarde verwijderen. Deze migratie raakt uitsluitend de
-- twee kolommen die bij de startflow van een revalidatietraject horen.
--
-- Beide tabellen hebben al RLS met een deny-all policy; kolommen erbij
-- veranderen daar niets aan, dus er is hier geen RLS-werk.
--
-- Idempotent: opnieuw draaien is veilig.

-- Een criterium mag naar een globale catalogus-test wijzen. Gezet: een meting
-- van die test in een testrapport werkt het criterium automatisch bij.
ALTER TABLE public.rehab_criteria
  ADD COLUMN IF NOT EXISTS "catalogItemId" TEXT;

-- Herkomst van een automatisch gezette status: de rapport-meting die het
-- criterium kleurde. NULL bij handmatig gezette statussen.
ALTER TABLE public.rehab_criterion_status
  ADD COLUMN IF NOT EXISTS "reportEntryId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rehab_criteria_catalogItemId_fkey'
  ) THEN
    ALTER TABLE public.rehab_criteria
      ADD CONSTRAINT "rehab_criteria_catalogItemId_fkey"
      FOREIGN KEY ("catalogItemId") REFERENCES public.test_catalog_items(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rehab_criterion_status_reportEntryId_fkey'
  ) THEN
    ALTER TABLE public.rehab_criterion_status
      ADD CONSTRAINT "rehab_criterion_status_reportEntryId_fkey"
      FOREIGN KEY ("reportEntryId") REFERENCES public.test_report_entries(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
