// Tijdelijk script: voert supabase/migrations/20260420_enable_rls.sql uit
// én draait de RLS-check + policy-count uit het test-script.
// Gebruikt DIRECT_URL (poort 5432, geen pgbouncer) omdat de migratie
// meerdere DO $$ ... $$ blokken bevat.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(root, '.env.local') })

const url = process.env.DIRECT_URL
if (!url) throw new Error('DIRECT_URL ontbreekt in .env.local')

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260420_enable_rls.sql'),
  'utf8',
)

await client.connect()
console.log('🔌 Verbonden met Supabase (direct, port 5432)\n')

try {
  console.log('📦 RLS migratie uitvoeren...')
  await client.query(migration)
  console.log('✅ Migratie succesvol\n')
} catch (err) {
  console.error('❌ Migratie gefaald:', err.message)
  await client.end()
  process.exit(1)
}

console.log('🔍 Check 1 — RLS status per tabel:')
const rls = await client.query(`
  SELECT tablename, rowsecurity AS rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY rowsecurity, tablename
`)
for (const row of rls.rows) {
  const mark = row.rls_enabled ? '✅' : '❌ RLS UIT'
  console.log(`  ${mark}  ${row.tablename}`)
}

console.log('\n🔍 Check 2 — policies per tabel:')
const pols = await client.query(`
  SELECT tablename, COUNT(*)::int AS n
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
  ORDER BY tablename
`)
for (const row of pols.rows) {
  console.log(`  ${String(row.n).padStart(2)}  ${row.tablename}`)
}

const tablesWithPolicies = new Set(pols.rows.map((r) => r.tablename))
const missing = rls.rows
  .filter((r) => r.rls_enabled && !tablesWithPolicies.has(r.tablename))
  .map((r) => r.tablename)
if (missing.length > 0) {
  console.log('\n⚠️  RLS aan maar GEEN policies (alleen service_role kan erbij):')
  for (const t of missing) console.log(`    - ${t}`)
  console.log('    (anonymous_id_mappings hoort hier bewust bij)')
}

await client.end()
console.log('\n🏁 Klaar')
