-- ============================================================================
-- Doorlopende factuurnummer-teller voor de shop. Een Postgres-sequence geeft
-- gat-loze, concurrency-veilige nummers. Het factuurnummer wordt MBT26_0001
-- (MBT + tweecijferig jaar = informatief prefix, volgnummer = doorlopend over
-- jaren heen — wettelijk toegestaan in NL zolang de reeks aaneengesloten is).
--
-- Een sequence is GEEN public-tabel, dus RLS is niet van toepassing; PostgREST
-- stelt sequences ook niet bloot. Defensief trekken we toch de rechten van de
-- anon/authenticated-rollen in. Idempotent.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS shop_invoice_seq START 1;

DO $$ BEGIN
  REVOKE ALL ON SEQUENCE shop_invoice_seq FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null; END $$;
