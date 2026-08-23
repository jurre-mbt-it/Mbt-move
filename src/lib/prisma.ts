import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Vercel build-step heeft niet altijd DATABASE_URL beschikbaar (alleen DIRECT_URL),
  // dus we vallen terug op DIRECT_URL als DATABASE_URL ontbreekt.
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL
  if (!connectionString || connectionString.includes('placeholder') || connectionString.includes('localhost')) {
    // Lazy stub: throwt pas bij eerste DB-call. Voorkomt dat `next build` crasht
    // tijdens "Collecting page data" als env vars in de build-sandbox missen.
    // In productie bestaat dit pad niet (DATABASE_URL altijd gezet); dit is
    // puur build-time vangnet sinds Prisma v7 een lege `new PrismaClient()`
    // niet meer toestaat.
    //
    // "Pas bij de eerste DB-call" betekent dat de stub het OPBOUWEN van de
    // client moet overleven. Hieronder draait `basePrisma.$extends(...)` op
    // moduleniveau, en dat is zelf al een property-toegang: een stub die op
    // álles gooit, gooit dus tijdens de import en nekt precies de build die hij
    // moest redden. Dat gebeurde ook — elke preview-build (geen DATABASE_URL op
    // die omgeving) viel om op "Failed to collect configuration for
    // /api/auth/sync-user". Daarom laat de stub twee dingen door:
    //   - `$extends` geeft de stub zelf terug, zodat de keten hierboven bouwt;
    //   - symbolen en `then` geven undefined, zodat de stub geen thenable is en
    //     een await of een console.log er niet op stukloopt.
    // Alles wat naar een echte query ruikt gooit onverminderd hard.
    const stub: PrismaClient = new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (prop === '$extends') return () => stub
        if (typeof prop === 'symbol' || prop === 'then') return undefined
        throw new Error(
          `[prisma] DATABASE_URL/DIRECT_URL ontbreekt, kan ${String(prop)} niet uitvoeren. ` +
          `Stel de env var in via Vercel project settings of .env.local.`
        )
      },
    })
    return stub
  }

  // Supabase PgBouncer (transaction mode) vereist pgbouncer=true
  const poolUrl = connectionString.includes('pgbouncer=true')
    ? connectionString
    : connectionString + (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true'

  const pool = new Pool({
    connectionString: poolUrl,
    ssl: { rejectUnauthorized: false },
    max: 3, // Vercel serverless: max 3 connecties per instantie
  })

  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const basePrisma = globalForPrisma.prisma ?? createPrismaClient()

/**
 * Soft-delete enforcement op `User`. AVG art. 17 (right-to-be-forgotten)
 * markeert verwijderingsverzoeken via `deletedAt` met een 30-dagen grace
 * (cron `api/cron/gdpr-cleanup` ruimt definitief op). Tijdens die window
 * mogen reads de verwijderde rij niet meer zien — anders blijft een
 * "vergeten" patiënt in patient-lijsten, exports, etc. staan.
 *
 * Deze client-extension injecteert `deletedAt: null` op alle reads van
 * User. Escape-hatch voor admin/cron-flows: passeer `deletedAt: undefined`
 * óf overschrijf expliciet (bv. `deletedAt: { not: null }`) in de WHERE
 * — die top-level value wint van de default door spread-order.
 */
const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

const extendedPrisma = basePrisma.$extends({
  query: {
    user: {
      async $allOperations({ operation, args, query }) {
        if (READ_OPS.has(operation)) {
          const a = args as { where?: Record<string, unknown> }
          a.where = { deletedAt: null, ...(a.where ?? {}) }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return query(args as any)
      },
    },
  },
})

/**
 * Type-cast terug naar `PrismaClient` zodat alle downstream-helpers die
 * `prisma: PrismaClient` typen ongewijzigd blijven werken. We voegen via
 * deze extension géén nieuwe model-properties of methods toe (alleen
 * `query`-interceptors), dus de cast verliest geen API-oppervlak.
 */
export const prisma = extendedPrisma as unknown as PrismaClient

// In development hergebruik de basis-client om hot-reload verbindingen
// te voorkomen. We slaan de NIET-extended client op zodat hot-reload de
// extension opnieuw toepast (extended client is een readonly type).
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma
