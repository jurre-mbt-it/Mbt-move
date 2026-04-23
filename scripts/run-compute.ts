import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { prisma } from '../src/lib/prisma'
import { computeInsights } from '../src/server/insights/compute'

async function main() {
  const res = await computeInsights(prisma as never)
  console.log(JSON.stringify(res, null, 2))
}

main().finally(() => prisma.$disconnect())
