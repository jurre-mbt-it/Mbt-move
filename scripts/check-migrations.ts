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
    // De tabel zelf en deze kolom komen van `prisma db push`, maar
    // 20260805 leunt erop: dat bestand indexeert op "reactivatedAt".
    // Ontbreekt de kolom, dan is de push nooit gedraaid en heeft de rest van
    // de feature geen grond.
    name: 'patient_care_status tabel met reactivatedAt kolom',
    migration: '20260805_care_status_reactivated.sql',
    run: async () => {
      try {
        await prisma.$queryRaw`SELECT "reactivatedAt" FROM patient_care_status LIMIT 1`
        return true
      } catch {
        return false
      }
    },
  },
  {
    // `prisma migrate diff` ziet partiële indexen niet, dus dit is de enige
    // manier om te merken dat een omgeving achterloopt. Zonder 20260805 staan
    // de indexen er nog in hun oude vorm (zonder de reactivatedAt-voorwaarde)
    // en botst de tweede archiveer-cyclus op een rij uit de historie: de app
    // meldt dan "Deze patiënt staat al op inactief" over een patiënt die juist
    // actief is, en dat is vanuit de UI niet meer recht te zetten. De
    // definitie moet dus mee gecontroleerd worden, niet alleen het bestaan.
    name: 'patient_care_status indexen tellen alleen lopende markeringen',
    migration: '20260805_care_status_reactivated.sql',
    run: async () => {
      const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'patient_care_status'
          AND indexname IN (
            'patient_care_status_one_per_practice',
            'patient_care_status_one_per_coach'
          )`
      if (rows.length !== 2) return false
      return rows.every((r) => r.indexdef.includes('reactivatedAt'))
    },
  },
  {
    // Bewaakt dat precies één van practiceId/coachId gevuld is. Prisma kent
    // geen CHECK-constraints, dus ook deze is onzichtbaar in elke diff. Valt
    // hij weg, dan kan een markering in twee scopes tegelijk zichtbaar zijn
    // (coach archiveert een praktijk-patiënt) of in geen enkele, en dan is
    // heractiveren er niet meer bij.
    name: 'patient_care_status_one_scope CHECK-constraint',
    migration: '20260804_patient_care_status_one_scope.sql',
    run: async () => {
      // Via pg_class/pg_namespace in plaats van ::regclass, want die cast
      // gooit als de tabel ontbreekt en zou de hele check-run afbreken.
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
        WHERE c.conname = 'patient_care_status_one_scope'
          AND c.contype = 'c'
          AND t.relname = 'patient_care_status'
          AND ns.nspname = 'public'`
      return Number(rows[0]?.n ?? 0) === 1
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
