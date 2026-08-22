-- Taal van de gebruiker voor pushmeldingen en foutmeldingen (2026-08-22).
--
-- De iOS-app volgt de telefoontaal (of een keuze in Instellingen) en meldt de
-- uitkomst via auth.setLocale. Bestaande rijen worden NL: niemand merkt iets
-- tot de app de kolom zet. Eerst deze migratie draaien, dán de server
-- deployen; de Prisma-client verwacht de kolom zodra hij live staat.

DO $$ BEGIN
  CREATE TYPE "Locale" AS ENUM ('NL', 'EN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "locale" "Locale" NOT NULL DEFAULT 'NL';
