-- Rehab-trajecten, fase B: rehab_criterion_status krijgt "trackerId".
--
-- rehab_criterion_status hangt vandaag aan "patientId", wat na fase A niet
-- meer klopt: een patiënt kan nu meerdere trajecten (na elkaar) hebben, en
-- een statusrij hoort bij één specifiek traject, niet bij de patiënt in het
-- algemeen. Deze fase voegt "trackerId" toe, backfilled 'm 1-op-1 vanuit de
-- huidige (nog enige) tracker per patiënt, en maakt 'm daarna verplicht.
--
-- Moet DIRECT NA fase A draaien, en pas nadat de backfill hieronder is
-- gecontroleerd. De backfill-UPDATE joint op
-- "patient_rehab_trackers"."patientId" = "rehab_criterion_status"."patientId",
-- en werkt dus alleen zolang er per patiënt hooguit één tracker bestaat —
-- precies de aanname die na fase A nog geldt (er is nog geen tweede traject
-- aangemaakt, dat kan pas na de code-deploy in de tussenfase).
--
-- Additief en terug te draaien (zie rollback-sectie in
-- docs/superpowers/specs/2026-07-31-rehab-episodes-migratie-sql.md), BEHALVE
-- de DELETE hieronder: die verwijdert data en is niet vanzelf terug te
-- draaien, alleen vanuit de JSON-backup.
--
-- Geen eigen BEGIN/COMMIT: prisma db execute stuurt dit bestand al als één
-- impliciete transactie. Geen CREATE INDEX CONCURRENTLY om dezelfde reden.

ALTER TABLE public.rehab_criterion_status ADD COLUMN IF NOT EXISTS "trackerId" text;

UPDATE public.rehab_criterion_status s
SET "trackerId" = t."id"
FROM public.patient_rehab_trackers t
WHERE t."patientId" = s."patientId" AND s."trackerId" IS NULL;

-- Controle vóór de DELETE. Verwacht: 2.
-- SELECT count(*) FROM public.rehab_criterion_status WHERE "trackerId" IS NULL;

-- LET OP, ONOMKEERBAAR ZONDER BACKUP.
-- De twee rijen die hier overblijven horen bij patiënt c329f19b-... die hard
-- verwijderd is; er bestaat geen tracker meer om ze aan te koppelen, dus ze
-- kunnen niet meekomen naar "trackerId" en worden hier definitief verwijderd.
-- Dit is medische statusdata (RehabCriterionStatus: R/O/G-beoordeling +
-- meetwaarde). Draai deze DELETE UITSLUITEND nadat de JSON-backup van de
-- wees-rijen bevestigd op schijf staat in scripts/backups/ (zie de
-- SELECT ... LEFT JOIN uit de spec, sectie "Fase B"). Zonder die backup zijn
-- deze twee rijen na dit statement nergens meer te herstellen.
DELETE FROM public.rehab_criterion_status WHERE "trackerId" IS NULL;

ALTER TABLE public.rehab_criterion_status ALTER COLUMN "trackerId" SET NOT NULL;

-- Dicht meteen het AVG-gat: statusrijen overleefden tot nu toe een verwijderde gebruiker.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rehab_criterion_status_trackerId_fkey') THEN
    ALTER TABLE public.rehab_criterion_status
      ADD CONSTRAINT "rehab_criterion_status_trackerId_fkey"
      FOREIGN KEY ("trackerId") REFERENCES public.patient_rehab_trackers("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "rehab_criterion_status_trackerId_criterionId_key"
  ON public.rehab_criterion_status ("trackerId", "criterionId");
CREATE INDEX IF NOT EXISTS "rehab_criterion_status_trackerId_idx"
  ON public.rehab_criterion_status ("trackerId");
