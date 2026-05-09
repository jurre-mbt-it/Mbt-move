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
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        throw new Error(
          `[prisma] DATABASE_URL/DIRECT_URL ontbreekt — kan ${String(prop)} niet uitvoeren. ` +
          `Stel de env var in via Vercel project settings of .env.local.`
        )
      },
    })
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// In development hergebruik de client om hot-reload verbindingen te voorkomen
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
