/**
 * Seed de eerste 9 consumenten-producten als GEPUBLICEERD, met NL-verkoopteksten
 * in de MBT tone of voice (direct/"je", evidence-based, geruststellend, mythes
 * ontkrachtend). GEEN em-dashes (—) en geen slogan-achtige oneliners.
 * Idempotent (upsert op slug). Schema-koppeling (programId) blijft leeg tot de
 * Program-templates er zijn.
 *
 * Draaien:  npx tsx scripts/seed-shop-products.ts
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

type Seed = {
  slug: string
  name: string
  tagline: string
  description: string
  priceCents: number
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  durationWeeks: number
  bodyRegion: Array<
    'KNEE' | 'SHOULDER' | 'BACK' | 'ANKLE' | 'HIP' | 'FULL_BODY' | 'LUMBAR' | 'FOOT'
  >
  highlights: string[]
  intakeTags: string[]
}

const PRODUCTS: Seed[] = [
  {
    slug: 'hardloop-kracht-beginner',
    name: 'Hardloop Krachtschema (Beginner)',
    tagline: 'Sterke benen en heupen die het hardlopen aankunnen.',
    description:
      'Krachttraining is de beste blessurepreventie die er is, ook als je nog nooit in de gym hebt gestaan. In 8 weken bouw je rustig en gestructureerd op. Je benen, heupen en romp worden sterker, zodat je lichaam de belasting van het hardlopen makkelijker draagt. Twee keer per week, thuis of in de gym.',
    priceCents: 2995,
    level: 'BEGINNER',
    durationWeeks: 8,
    bodyRegion: ['FULL_BODY'],
    highlights: ['8 weken, rustig opgebouwd', '2× per week, ongeveer 30 minuten', 'Thuis of in de gym te doen', 'Uitleg en video bij elke oefening'],
    intakeTags: ['hardlopen', 'kracht', 'beginner', 'blessurepreventie'],
  },
  {
    slug: 'hardloop-kracht-gevorderd',
    name: 'Hardloop Krachtschema (Gevorderd)',
    tagline: 'Meer kracht en explosiviteit voor de hardloper die al traint.',
    description:
      'Je traint al met gewichten en wilt een stap zetten. Dit schema bouwt verder op je basis met zwaardere, samengestelde oefeningen en de eerste sprongkracht. Dat doen we volgens het principe van progressieve overbelasting, met aandacht voor de plekken waar hardlopers het vaakst vastlopen.',
    priceCents: 2995,
    level: 'INTERMEDIATE',
    durationWeeks: 8,
    bodyRegion: ['FULL_BODY'],
    highlights: ['8 weken, 2-3× per week', 'Samengestelde oefeningen en sprongkracht', 'Progressieve opbouw', 'Gericht op je loopeconomie'],
    intakeTags: ['hardlopen', 'kracht', 'gevorderd', 'explosiviteit'],
  },
  {
    slug: 'hardloop-kracht-vergevorderd',
    name: 'Hardloop Krachtschema (Vergevorderd)',
    tagline: 'Maximale kracht en explosiviteit voor de ervaren sporter.',
    description:
      'Voor de ervaren hardloper of krachtsporter die het naadje van de kous wil. Tien weken zware krachttraining en plyometrie, geperiodiseerd opgebouwd zodat alles wat je in de gym doet zich vertaalt naar je hardlopen.',
    priceCents: 2995,
    level: 'ADVANCED',
    durationWeeks: 10,
    bodyRegion: ['FULL_BODY'],
    highlights: ['10 weken, geperiodiseerd', 'Zware kracht en plyometrie', '3× per week', 'Voor ervaren sporters'],
    intakeTags: ['hardlopen', 'kracht', 'vergevorderd', 'plyometrie'],
  },
  {
    slug: 'achillespees-tendinopathie',
    name: 'Achillespees Tendinopathie',
    tagline: 'Van een pijnlijke achillespees naar een pees die weer belasting aankan.',
    description:
      'Een pijnlijke achillespees los je niet op met rust, maar met de juiste belasting. Dit programma bouwt je pees in fases sterker en belastbaarder, van rustige isometrie naar zwaardere kracht. Je werkt met heldere criteria, zodat je pas doorgaat naar de volgende fase als je lichaam er klaar voor is.',
    priceCents: 3995,
    level: 'INTERMEDIATE',
    durationWeeks: 12,
    bodyRegion: ['ANKLE', 'FOOT'],
    highlights: ['12 weken in heldere fases', 'Opbouw via progressieve belasting', 'Criteria bepalen wanneer je doorgaat', 'Speciaal voor hardlopers'],
    intakeTags: ['achillespees', 'hardlopen', 'pijn', 'tendinopathie', 'enkel'],
  },
  {
    slug: 'patella-tendinopathie',
    name: 'Patella Tendinopathie',
    tagline: 'Sterker rond de knieschijf, zodat je weer kunt springen en sporten.',
    description:
      "Een 'springersknie' vraagt om geduldige, gerichte belasting van de knie. In twaalf weken bouw je op van isometrie naar zware kracht en uiteindelijk sportspecifieke belasting, zodat je weer kunt springen, landen en sporten zonder die zeurende pijn onder de knieschijf.",
    priceCents: 3995,
    level: 'INTERMEDIATE',
    durationWeeks: 12,
    bodyRegion: ['KNEE'],
    highlights: ['12 weken in fases', 'Van isometrie naar zware kracht', 'Voor spring- en knielast', 'Uitleg en video bij elke oefening'],
    intakeTags: ['knie', 'springersknie', 'patella', 'tendinopathie'],
  },
  {
    slug: 'kruisband-acl-pre-operatie',
    name: 'Kruisband (ACL) Pre-operatie',
    tagline: 'Ga zo sterk mogelijk je kruisbandoperatie in.',
    description:
      'Hoe sterker je knie de operatie ingaat, hoe beter je er weer uitkomt. Dat is inmiddels goed onderbouwd. In de 6 weken voor je operatie werk je aan kracht, controle en vertrouwen in je knie, zodat je herstel daarna een betere start krijgt. Bedoeld naast de begeleiding van je arts en fysiotherapeut.',
    priceCents: 4495,
    level: 'BEGINNER',
    durationWeeks: 6,
    bodyRegion: ['KNEE'],
    highlights: ['6 weken prehab voor de operatie', 'Kracht en controle in de knie', 'Sterkere start van je herstel', 'Naast je eigen behandeling'],
    intakeTags: ['kruisband', 'acl', 'knie', 'pre-operatief', 'prehab'],
  },
  {
    slug: 'meniscus-pre-operatie',
    name: 'Meniscus Pre-operatie',
    tagline: 'Bereid je knie rustig en gericht voor op je ingreep.',
    description:
      'Een sterke, goed gecontroleerde knie maakt het herstel na een meniscusingreep makkelijker. Dit programma van 6 weken bouwt rustig kracht en bewegingscontrole rond de knie op, zodat je zo goed mogelijk voorbereid de operatie ingaat. Bedoeld naast de begeleiding van je arts en fysiotherapeut.',
    priceCents: 4495,
    level: 'BEGINNER',
    durationWeeks: 6,
    bodyRegion: ['KNEE'],
    highlights: ['6 weken prehab', 'Gerichte opbouw rond de knie', 'Rustige, veilige progressie', 'Naast je eigen behandeling'],
    intakeTags: ['meniscus', 'knie', 'pre-operatief', 'prehab'],
  },
  {
    slug: 'sterke-rug',
    name: 'Sterke Rug',
    tagline: 'Een sterke, belastbare rug die minder snel klachten geeft.',
    description:
      "Bij rugklachten is 'voorzichtig doen' meestal precies het verkeerde advies. Een rug wordt juist sterker en minder gevoelig door 'm slim te belasten. In 8 weken bouw je kracht en controle op in je rug en romp, zodat je weer kunt tillen, bukken en bewegen met vertrouwen in plaats van angst.",
    priceCents: 3495,
    level: 'BEGINNER',
    durationWeeks: 8,
    bodyRegion: ['LUMBAR', 'BACK'],
    highlights: ['8 weken opbouw', 'Kracht en controle in rug en romp', 'Thuis of in de gym', 'Voor terugkerende rugklachten'],
    intakeTags: ['rug', 'lage rugpijn', 'rugklachten', 'core'],
  },
  {
    slug: 'heup-fai',
    name: 'Heup FAI',
    tagline: 'Vrijer en sterker bewegen met heupklachten.',
    description:
      "Bij heup-impingement (FAI) helpt het niet om de heup te ontzien. Het helpt juist om 'm gericht sterker en stabieler te maken binnen een bereik dat goed voelt. In 10 weken bouw je heupkracht en controle op, zodat bewegen, hurken en sporten weer soepeler gaan.",
    priceCents: 3995,
    level: 'INTERMEDIATE',
    durationWeeks: 10,
    bodyRegion: ['HIP'],
    highlights: ['10 weken opbouw', 'Heupkracht en controle', 'Binnen een comfortabel bereik', 'Voor FAI- en liesklachten'],
    intakeTags: ['heup', 'fai', 'heuppijn', 'lies', 'mobiliteit'],
  },
]

async function main() {
  let i = 0
  for (const p of PRODUCTS) {
    i += 1
    const data = {
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      status: 'PUBLISHED' as const,
      priceCents: p.priceCents,
      vatRate: 21,
      level: p.level,
      durationWeeks: p.durationWeeks,
      bodyRegion: p.bodyRegion,
      highlights: p.highlights,
      intakeTags: p.intakeTags,
      sortOrder: i,
    }
    await prisma.shopProduct.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    })
    console.log(`OK ${p.slug} (${(p.priceCents / 100).toFixed(2)})`)
  }
  const total = await prisma.shopProduct.count()
  console.log(`\nKlaar. ${total} producten in de shop.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
