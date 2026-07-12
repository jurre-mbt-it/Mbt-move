/**
 * Seedt de drie hardloopanalyse-diensten in de shop (Loopcheck / Loopanalyse Pro
 * / Loopanalyse Elite). Diensten (kind = SERVICE): geen voorraad/verzending. Er
 * is geen boekingslink gezet, dus afrekenen loopt via iDEAL (Mollie) zodra dat
 * live is; zet `bookingUrl` (bv. Verne Health) via /admin/shop om er direct een
 * "Plan je afspraak"-knop van te maken.
 *
 * Idempotent: upsert op slug. Draaien:
 *   npx tsx scripts/seed-running-analysis-services.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

type Service = {
  slug: string
  name: string
  tagline: string
  description: string
  priceCents: number
  highlights: string[]
  sortOrder: number
}

const SERVICES: Service[] = [
  {
    slug: 'loopcheck',
    name: 'Loopcheck',
    tagline: 'Het perfecte startpunt voor de startende loper',
    description:
      'Snel inzicht in je looppatroon, zonder uitgebreid onderzoek. Duur: 30 minuten.\n\n' +
      'Voor recreatieve hardlopers, beginners, en iedereen die wil weten hoe ze lopen.',
    priceCents: 7900,
    highlights: [
      'Korte intake: doelen, klachten, loopgeschiedenis',
      'AI-loopanalyse (zij- en achterzicht)',
      'Bespreking van de belangrijkste bevindingen op scherm',
      '2-3 gerichte adviezen, direct toepasbaar',
      'Digitaal rapport met biomechanische scores (PDF)',
      'Visuele overlay van je looppatroon',
    ],
    sortOrder: 10,
  },
  {
    slug: 'loopanalyse-pro',
    name: 'Loopanalyse Pro',
    tagline: 'De complete analyse voor de fanatiekeling',
    description:
      'Analyse plus fysiek onderzoek van mobiliteit, kracht en stabiliteit. Duur: 60 minuten.\n\n' +
      'Voor serieuze recreanten, marathonvoorbereiders, en hardlopers met terugkerende klachten.',
    priceCents: 14900,
    highlights: [
      'Uitgebreide intake: loopgeschiedenis, belasting, doelen',
      'Fysiek onderzoek: mobiliteit, kracht, stabiliteit',
      'AI-analyse op twee snelheden naar keuze',
      'Side-by-side video met gemarkeerde meetpunten',
      'Persoonlijk actieplan met top 5 verbeterpunten, oefeningen, drills en trainingsadvies (PDF)',
    ],
    sortOrder: 20,
  },
  {
    slug: 'loopanalyse-elite',
    name: 'Loopanalyse Elite',
    tagline: 'De meest uitgebreide analyse',
    description:
      'Meerdere snelheden, kracht- en mobiliteitsprogramma en periodisering voor 12 weken. Duur: 90 minuten.\n\n' +
      'Voor wedstrijdlopers, marathonlopers, triathleten, en hardlopers na langdurige blessure.',
    priceCents: 18900,
    highlights: [
      'Alles uit de Loopanalyse Pro',
      'Volledige mobiliteitsscreening en functionele bewegingsanalyse',
      'Analyse op rustig tempo, wedstrijdtempo en threshold',
      'Kracht- en mobiliteitsprogramma voor 12 weken',
      'Uitgebreid prestatie- en preventieplan met periodiseringsadvies (PDF)',
      'Baseline-meting als referentie voor vervolganalyses',
    ],
    sortOrder: 30,
  },
]

async function main() {
  for (const s of SERVICES) {
    const data = {
      name: s.name,
      kind: 'SERVICE' as const,
      status: 'PUBLISHED' as const,
      tagline: s.tagline,
      description: s.description,
      priceCents: s.priceCents,
      currency: 'EUR',
      vatRate: 21,
      highlights: s.highlights,
      sortOrder: s.sortOrder,
      // Diensten: geen schema/voorraad/verzending.
      programId: null,
      requiresShipping: false,
    }
    const product = await prisma.shopProduct.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, ...data },
      update: data,
      select: { id: true, slug: true, name: true, status: true, priceCents: true },
    })
    console.log(
      `· ${product.status.padEnd(9)} /${product.slug}  ${product.name}  €${(product.priceCents / 100).toFixed(2)}`,
    )
  }
  console.log('\nKlaar. Zichtbaar in de shop (admin) via /admin/shop en /shop.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
