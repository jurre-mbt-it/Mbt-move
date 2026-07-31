/**
 * Checkt of de Supabase-migraties uit `supabase/migrations/` zijn gedraaid
 * tegen de geconfigureerde DATABASE_URL. Test puur op aanwezigheid van
 * verwachte tabellen/kolommen — geen DDL-comparison.
 *
 * Gebruik: `npx tsx scripts/check-migrations.ts`
 * Exit-code 0 = alles aanwezig. Exit-code 1 = iets mist (aanbeveling geprint).
 */
import { prisma } from '../src/lib/prisma'

type Check = {
  name: string
  migration: string
  run: () => Promise<boolean>
}

const checks: Check[] = [
  {
    name: 'patient_rehab_trackers.id kolom',
    migration: '20260801_rehab_episodes_a.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "id" FROM patient_rehab_trackers LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'rehab_criterion_status.trackerId kolom',
    migration: '20260801_rehab_episodes_b.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "trackerId" FROM rehab_criterion_status LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    // Negatieve check: de kolom MOET weg zijn. Staat hij er nog, dan is C2 niet
    // gedraaid en lopen schema en database uiteen zonder dat iets faalt.
    name: 'rehab_criterion_status.patientId is weg',
    migration: '20260803_rehab_episodes_c2.sql',
    run: async () => {
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rehab_criterion_status'
          AND column_name = 'patientId'`
      return Number(rows[0]?.n ?? 0) === 0
    },
  },
  {
    name: 'invite_codes tabel',
    migration: '20260423_invite_codes_audit_gdpr.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT 1 FROM invite_codes LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'audit_logs tabel',
    migration: '20260423_invite_codes_audit_gdpr.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT 1 FROM audit_logs LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'users.deletedAt kolom',
    migration: '20260423_invite_codes_audit_gdpr.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "deletedAt" FROM users LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'mfa_backup_codes tabel',
    migration: '20260423_mfa_backup_codes.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT 1 FROM mfa_backup_codes LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'programs.practiceId kolom',
    migration: '20260424_practice_scope_program_weekschedule.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "practiceId" FROM programs LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'week_schedules.practiceId kolom',
    migration: '20260424_practice_scope_program_weekschedule.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "practiceId" FROM week_schedules LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    name: 'cardio_logs.hrOverriddenAt kolom',
    migration: '20260726_cardio_hr_override.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "hrOverriddenAt" FROM cardio_logs LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
]

async function main() {
  console.log('\n🔍 Checking database migrations…\n')
  const results = await Promise.all(
    checks.map(async (c) => ({ ...c, ok: await c.run() })),
  )

  const missing = results.filter((r) => !r.ok)
  const present = results.filter((r) => r.ok)

  for (const r of present) {
    console.log(`  ✓ ${r.name}`)
  }
  for (const r of missing) {
    console.log(`  ✗ ${r.name}  — staat in ${r.migration}`)
  }

  if (missing.length > 0) {
    console.log('\n⚠️  Eén of meer migraties zijn NIET gedraaid.')
    console.log('   Draai ze met één van:\n')
    console.log('     npm run db:push')
    console.log('     # of handmatig per file:')
    for (const m of [...new Set(missing.map((r) => r.migration))]) {
      console.log(`     psql "$DATABASE_URL" -f supabase/migrations/${m}`)
    }
    console.log('')
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ Alle migraties zijn actief.\n')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('Check faalt:', err)
  await prisma.$disconnect()
  process.exit(2)
})
