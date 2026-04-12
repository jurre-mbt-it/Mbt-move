import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || connectionString.includes('placeholder') || connectionString.includes('localhost')) {
    return new PrismaClient()
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
