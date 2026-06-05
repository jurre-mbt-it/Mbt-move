/**
 * Seed de fysieke artikelen (merchandise) van de shop als GEPUBLICEERD, met
 * NL-verkoopteksten in de MBT tone of voice (direct/"je", nuchter, geen
 * em-dashes, geen slogan-oneliners). Idempotent (upsert op slug).
 *
 * Prijzen zijn INCLUSIEF 21% btw (zelfde conventie als de schema-producten:
 * priceCents = brutoprijs in centen). De heroImageUrl wijst naar een bestand in
 * /public/shop op mbt-gym.nl.
 *
 * Draaien:  npx tsx scripts/seed-shop-articles.ts
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

const SITE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mbt-gym.nl').replace(/\/$/, '')

type ArticleSeed = {
  slug: string
  name: string
  tagline: string
  description: string
  priceCents: number // inclusief btw
  sku: string
  stockQty: number | null // null = voorraad niet bijgehouden
  weightGrams: number | null
  requiresShipping: boolean // false = afhalen in de praktijk (geen verzending)
  heroImage: string // bestandsnaam in /public/shop
  highlights: string[]
  sortOrder: number
}

const ARTICLES: ArticleSeed[] = [
  {
    slug: 'mbt-lacrosse-bal',
    name: 'MBT Lacrosse Bal',
    tagline: 'Een stevige bal om gericht stijve, gespannen spieren los te maken.',
    description:
      'Een harde, vaste bal waarmee je heel gericht op een gespannen plek kunt drukken, dieper dan met een foam roller lukt. Rol ’m onder je voet, leg ’m tegen de muur achter je schouderblad of onder je bil, en zoek de plek die om aandacht vraagt. Handig voor en na het sporten en op de momenten dat je merkt dat een spier vastzit. Compact genoeg om in je sporttas of bureaula te bewaren.',
    priceCents: 800,
    sku: 'MBT-LB-01',
    stockQty: null,
    weightGrams: 150,
    requiresShipping: false, // afhalen in de praktijk, mensen nemen 'm direct mee
    heroImage: 'mbt-lacrosse-bal.jpg',
    highlights: [
      'Stevige, vaste bal voor diepe druk',
      'Voor triggerpoints en stijve spieren',
      'Voet, bil, kuit, schouder en rug',
      'Compact, neem ’m overal mee naartoe',
    ],
    sortOrder: 0,
  },
]

async function main() {
  for (const a of ARTICLES) {
    const data = {
      name: a.name,
      tagline: a.tagline,
      description: a.description,
      kind: 'PHYSICAL' as const,
      status: 'PUBLISHED' as const,
      priceCents: a.priceCents,
      currency: 'EUR',
      vatRate: 21,
      heroImageUrl: `${SITE}/shop/${a.heroImage}`,
      highlights: a.highlights,
      sku: a.sku,
      stockQty: a.stockQty,
      requiresShipping: a.requiresShipping,
      weightGrams: a.weightGrams,
      sortOrder: a.sortOrder,
    }
    await prisma.shopProduct.upsert({
      where: { slug: a.slug },
      update: data,
      create: { slug: a.slug, ...data },
    })
    console.log(`OK ${a.slug} (€ ${(a.priceCents / 100).toFixed(2)})`)
  }
  const total = await prisma.shopProduct.count()
  console.log(`\nKlaar. ${total} producten in de shop (incl. schema's).`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
