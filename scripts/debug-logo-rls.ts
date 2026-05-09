import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  console.log('\n── Jurre user-record ──')
  const me = await prisma.user.findUnique({
    where: { email: 'jurre@movementbasedtherapy.nl' },
    select: { id: true, email: true, supabaseUserId: true, practiceId: true, isPracticeOwner: true, role: true },
  })
  console.log(me)

  console.log('\n── Storage policies op practice-logos ──')
  // pg_policies geeft de actieve RLS-policies terug
  const policies = await prisma.$queryRawUnsafe<Array<{ policyname: string; cmd: string; qual: string | null; with_check: string | null }>>(
    `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`
  )
  for (const p of policies) {
    console.log(`\n  • ${p.policyname} [${p.cmd}]`)
    console.log(`    USING:      ${p.qual ?? '(none)'}`)
    console.log(`    WITH CHECK: ${p.with_check ?? '(none)'}`)
  }

  console.log('\n── Bucket-config ──')
  const buckets = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; public: boolean; created_at: Date }>>(
    `SELECT id, name, public, created_at FROM storage.buckets WHERE id = 'practice-logos'`
  )
  console.log(buckets)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
