/**
 * Zet één voorbeeld-testrapport klaar op het Apple-demo-account (ATLEET,
 * productie), zodat er een productfoto van de rapportage bestaat voor de
 * publieke site. Zonder dit rapport bestaat er alleen een rapport van een
 * échte patiënt, en dat mag nooit op een foto.
 *
 * Het rapport hoort bij hetzelfde verhaal als seed-demo-athlete.ts: een
 * VKB-reconstructie rechts, inmiddels vijf maanden verder, fase 3 van het
 * Melbourne-protocol. De waarden zijn verzonnen maar kloppen onderling: de
 * quadriceps loopt achter (LSI 79%), de hop-testen zitten al rond de 90%.
 * Dat is precies het beeld dat een rapport bruikbaar maakt om te laten zien.
 *
 * Draaien:        npx tsx scripts/seed-demo-test-report.ts
 * Terugdraaien:   npx tsx scripts/seed-demo-test-report.ts --wipe
 *
 * LET OP: dit schrijft naar de productiedatabase (DIRECT_URL uit .env.local).
 * Alles is gescoped op het demo-account; er wordt geen rij van een andere
 * gebruiker aangeraakt. De herkenning loopt via NOTES_MARK, zodat een
 * herhaalde run het eigen rapport vervangt en niets anders.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

// Repo is publiek: het adres van het demo-account staat niet hardcoded maar
// in .env.local (DEMO_EMAIL), dat hierboven al geladen is.
const EMAIL = process.env.DEMO_EMAIL ?? ''
if (!EMAIL) {
  console.error('Zet DEMO_EMAIL in .env.local (e-mail van het demo-account).')
  process.exit(1)
}
/** Sleutel voor --wipe en voor een idempotente herhaling. */
const NOTES_MARK = 'demo-seed-testrapport'

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

type Entry = {
  category: string
  categoryOrder: number
  name: string
  subtitle?: string
  source?: string
  kind?: 'BILATERAL' | 'SINGLE'
  unitPrimary?: string
  left?: number
  right?: number
  single?: number
  zoneGreenMin?: number
  zoneOrangeMin?: number
  notes?: string
}

const ENTRIES: Entry[] = [
  {
    category: 'Kracht',
    categoryOrder: 1,
    name: 'Quadriceps',
    subtitle: 'Isometrisch, 90 graden knieflexie',
    source: 'Handheld dynamometer',
    unitPrimary: 'Nm/kg',
    left: 3.12,
    right: 2.46,
    notes: 'Blijft de beperkende factor. Zwaarder belasten in de komende blokken.',
  },
  {
    category: 'Kracht',
    categoryOrder: 1,
    name: 'Hamstrings',
    subtitle: 'Isometrisch, 30 graden knieflexie',
    source: 'Handheld dynamometer',
    unitPrimary: 'Nm/kg',
    left: 2.28,
    right: 2.04,
  },
  {
    category: 'Kracht',
    categoryOrder: 1,
    name: 'Single leg press',
    subtitle: 'Geschat 1RM',
    source: 'Leg press',
    unitPrimary: 'kg',
    left: 122,
    right: 106,
  },
  {
    category: 'Power',
    categoryOrder: 2,
    name: 'Single hop for distance',
    source: 'Hop-batterij',
    unitPrimary: 'cm',
    left: 151,
    right: 136,
  },
  {
    category: 'Power',
    categoryOrder: 2,
    name: 'Triple hop for distance',
    source: 'Hop-batterij',
    unitPrimary: 'cm',
    left: 458,
    right: 419,
  },
  {
    category: 'Power',
    categoryOrder: 2,
    name: 'Side hop',
    subtitle: 'Aantal sprongen in 30 seconden',
    source: 'Hop-batterij',
    unitPrimary: 'n',
    left: 44,
    right: 38,
  },
  {
    category: 'Mobiliteit',
    categoryOrder: 3,
    name: 'Knieflexie',
    subtitle: 'Passief, buikligging',
    source: 'Goniometer',
    unitPrimary: 'graden',
    left: 141,
    right: 137,
    zoneGreenMin: 95,
    zoneOrangeMin: 90,
  },
  {
    category: 'Mobiliteit',
    categoryOrder: 3,
    name: 'Knie-extensie',
    subtitle: 'Passief, prone hang',
    source: 'Goniometer',
    unitPrimary: 'graden',
    left: 2,
    right: 2,
    zoneGreenMin: 95,
    zoneOrangeMin: 90,
    notes: 'Volledig symmetrisch, geen extensiebeperking.',
  },
]

const ADVICE = [
  {
    title: 'Quadriceps zwaarder belasten.',
    body: 'Twee krachtsessies per week met zware single leg press en leg extension, 4 sets van 5 herhalingen op 80 tot 85 procent. De symmetrie loopt hier achter op de rest.',
  },
  {
    title: 'Landen en afremmen opbouwen.',
    body: 'Drop jumps en cutting-oefeningen in oplopende hoogte en snelheid, telkens beoordeeld op knievalgus. Dit is de brug naar veldtraining.',
  },
  {
    title: 'Veldtraining uitbreiden.',
    body: 'Van rechtdoor hardlopen naar richtingsveranderingen op halve snelheid, twee keer per week, zolang de pijn onder de 3 blijft en de knie de dag erna niet zwelt.',
  },
]

const INTERPRETATIE = [
  'De hop-testen zitten met 89 tot 92 procent symmetrie in de doelzone, en dat is een duidelijke stap ten opzichte van de vorige meting. Springen en landen op één been gaat weer met vertrouwen.',
  'De quadriceps blijft achter op 79 procent. Dat is het verschil dat nu de terugkeer naar voetbal in de weg staat, want juist die spier vangt de landing op. De komende zes weken richten we daar het krachtblok op in.',
  'De mobiliteit is volledig: geen extensiebeperking en vier graden verschil in flexie, wat binnen de meetfout valt.',
].join('\n\n')

async function main() {
  const wipe = process.argv.includes('--wipe')

  const patient = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, name: true } })
  if (!patient) throw new Error(`Demo-account ${EMAIL} niet gevonden`)

  // Alleen de eigen rijen: herkenbaar aan de markering in notes.
  const bestaand = await prisma.testReport.findMany({
    where: { patientId: patient.id, notes: NOTES_MARK },
    select: { id: true },
  })
  if (bestaand.length) {
    await prisma.testReport.deleteMany({ where: { id: { in: bestaand.map((r) => r.id) } } })
    console.log(`   ${bestaand.length} eerder demo-rapport(en) verwijderd`)
  }
  if (wipe) {
    console.log('Klaar (teruggedraaid).')
    return
  }

  // Therapeut: de praktijkhouder van dezelfde praktijk.
  const therapist = await prisma.user.findFirst({
    where: { role: { in: ['THERAPIST', 'ADMIN'] }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!therapist) throw new Error('Geen therapeut gevonden om het rapport aan te hangen')

  const rapport = await prisma.testReport.create({
    data: {
      patientId: patient.id,
      therapistId: therapist.id,
      performedAt: new Date(2026, 7, 21, 10, 30),
      measurementNumber: 3,
      subtitle: 'Objectieve meting van kracht, power en mobiliteit',
      trajectLabel: 'van revalidatietraject',
      location: 'NDSM',
      injuryGoal: 'VKB-reconstructie rechts · terug naar voetbal',
      rehabPhaseLabel: 'Fase 3 · hardlopen, behendigheid en landen · maand 5',
      interpretation: INTERPRETATIE,
      nextTestMoment: 'Over 6 weken · begin oktober 2026 (maand 6,5)',
      nextTestGoal: 'Symmetrie boven 90 procent op alle krachttesten',
      status: 'FINAL',
      notes: NOTES_MARK,
      entries: {
        create: ENTRIES.map((e, i) => ({
          category: e.category,
          categoryOrder: e.categoryOrder,
          name: e.name,
          subtitle: e.subtitle ?? null,
          source: e.source ?? null,
          kind: e.kind ?? 'BILATERAL',
          unitPrimary: e.unitPrimary ?? null,
          leftPrimary: e.left ?? null,
          rightPrimary: e.right ?? null,
          singleValue: e.single ?? null,
          zoneGreenMin: e.zoneGreenMin ?? 90,
          zoneOrangeMin: e.zoneOrangeMin ?? 80,
          notes: e.notes ?? null,
          order: i,
        })),
      },
      advice: { create: ADVICE.map((a, i) => ({ order: i, title: a.title, body: a.body })) },
    },
    select: { id: true, entries: { select: { id: true } } },
  })

  console.log(`Rapport klaar voor ${patient.name}: ${rapport.id}`)
  console.log(`   ${rapport.entries.length} testen, ${ADVICE.length} adviezen, therapeut: ${therapist.name}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
