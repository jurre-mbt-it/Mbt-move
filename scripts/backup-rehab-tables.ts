/**
 * Dumpt de vijf rehab-tabellen naar scripts/backups/ vóór de episode-migratie.
 * Vangnet voor de PatientRehabTracker-primary-key-verhuizing: als die
 * migratie misgaat, valt de hersteloperatie terug op dit bestand.
 *
 * WAAROM RAUWE SQL EN GEEN prisma.<model>.findMany()
 * Dit script draait VÓÓR migratie A, dus tegen het OUDE schema. De
 * Prisma-client is op dat moment al gegenereerd op het NIEUWE schema en zet
 * dan "id", "closedById", "outcomeNote" en "trackerId" in zijn SELECT-lijst.
 * Die kolommen bestaan in productie nog niet, dus elke modelaanroep valt om
 * met 42703 ("column ... does not exist") en er komt geen backup. Fase B
 * verwijdert daarna twee medische statusrijen definitief.
 * Een backup hoort het schema van de BRON te volgen, niet dat van de client.
 *
 * to_jsonb(t.*) laat Postgres de rij serialiseren in plaats van Prisma. Dat
 * lost meteen het tweede probleem op: bij een kale SELECT * struikelt de
 * raw-query-deserialisatie over kolomtypes die Prisma niet kent (enums zoals
 * RehabCriterionStatusValue, en char), waarvoor je anders elke kolom
 * afzonderlijk naar text zou moeten casten. Via jsonb hoeft dat niet en blijft
 * de query schema-onafhankelijk.
 *
 * WEES-RIJEN
 * supabase/migrations/20260801_rehab_episodes_b.sql verwijdert de statusrijen
 * die na de backfill geen tracker hebben, en eist daarvóór een apart bestand
 * met precies die rijen. Keuze: dit script schrijft dat bestand er zelf bij
 * uit (rehab-criterion-status-orphans-<datum>.json), zodat er geen los
 * wegwerpscript nodig is dat iemand kan overslaan. De volledige dump bevat ze
 * ook, maar bij een herstelactie is een apart bestand sneller terug te vinden.
 * De spec en het plan verwijzen hiernaar.
 *
 * Gebruik:
 *   npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts           # dry-run (default)
 *   npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts --apply   # echt wegschrijven
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')

/** Alle rijen van één tabel, precies zoals ze in de bron staan. */
async function dumpTabel(tabel: string): Promise<unknown[]> {
  const rijen = await prisma.$queryRawUnsafe<Array<{ rij: unknown }>>(
    `SELECT to_jsonb(t.*) AS rij FROM public.${tabel} t`,
  )
  return rijen.map((r) => r.rij)
}

/**
 * De statusrijen die aan geen enkele tracker hangen. Joint op "patientId",
 * want dat is de sleutel die in BEIDE schemastaten bestaat: vóór migratie A is
 * hij de primary key van de trackers, daarna gewoon een kolom.
 */
async function dumpWeesRijen(): Promise<unknown[]> {
  const rijen = await prisma.$queryRawUnsafe<Array<{ rij: unknown }>>(
    `SELECT to_jsonb(s.*) AS rij
       FROM public.rehab_criterion_status s
       LEFT JOIN public.patient_rehab_trackers t ON t."patientId" = s."patientId"
      WHERE t."patientId" IS NULL`,
  )
  return rijen.map((r) => r.rij)
}

async function main() {
  const data = {
    takenOp: new Date().toISOString(),
    protocols: await dumpTabel('rehab_protocols'),
    phases: await dumpTabel('rehab_phases'),
    criteria: await dumpTabel('rehab_criteria'),
    trackers: await dumpTabel('patient_rehab_trackers'),
    statuses: await dumpTabel('rehab_criterion_status'),
  }
  const wezen = await dumpWeesRijen()

  const telling = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
    .concat(`wees-statussen: ${wezen.length}`)
    .join(', ')

  if (!APPLY) {
    console.log(`Dry-run. Zou wegschrijven: ${telling}`)
    console.log('Draai opnieuw met --apply om de bestanden te maken.')
    return
  }
  const dir = resolve(process.cwd(), 'scripts/backups')
  mkdirSync(dir, { recursive: true })
  const dag = new Date().toISOString().slice(0, 10)

  const pad = resolve(dir, `rehab-tables-${dag}.json`)
  writeFileSync(pad, JSON.stringify(data, null, 2))
  console.log(`Geschreven naar ${pad}: ${telling}`)

  // Altijd schrijven, ook bij nul rijen: migratie B eist dat dit bestand er
  // staat, en een leeg bestand is het bewijs dat er niets te verliezen viel.
  const weesPad = resolve(dir, `rehab-criterion-status-orphans-${dag}.json`)
  writeFileSync(weesPad, JSON.stringify(wezen, null, 2))
  console.log(`Geschreven naar ${weesPad}: ${wezen.length} rijen`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
