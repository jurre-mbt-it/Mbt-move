/**
 * Apple App Review test-account. Maakt (idempotent):
 *  1. een Supabase auth-user met e-mail + wachtwoord, direct e-mail-confirmed
 *     (de mailbox bestaat niet — daarom via de admin-API, geen signup-mail);
 *  2. de bijbehorende Prisma User-rij als ATLEET, DPA geaccepteerd (zodat de
 *     patient-data-endpoints niet geblokkeerd worden), gekoppeld aan de praktijk;
 *  3. een klein actief demo-programma zodat SCHEMA / sessie echte inhoud tonen.
 *
 * De reviewer logt in met e-mail + wachtwoord (nieuwe wachtwoord-login in de
 * app) en kan via Profiel → "Preview als…" ook de patiënt-weergave bekijken.
 *
 * Draaien:  npx tsx scripts/create-apple-test-account.ts
 * Verwijderen kan met scripts/delete-user.ts.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const EMAIL = 'mbtamsterdam_test@live.nl'
const PASSWORD = 'Appletest2026'
const NAME = 'Apple Review'
const DPA_VERSION = 'v1.0' // moet gelijk zijn aan src/lib/dpa-constants.ts
const PROG_NAME = 'App Review Demo — Krachtschema'

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function ensureAuthUser(): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'ATHLETE', name: NAME },
  })
  if (created?.user?.id) {
    console.log('· Supabase auth-user aangemaakt')
    return created.user.id
  }
  // Bestaat al → opzoeken en wachtwoord/confirm bijwerken (idempotent).
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
    if (!existing) throw error
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, role: 'ATHLETE', name: NAME },
    })
    console.log('· Supabase auth-user bestond al — wachtwoord/confirm bijgewerkt')
    return existing.id
  }
  throw new Error('Kon Supabase auth-user niet aanmaken')
}

async function main() {
  const authId = await ensureAuthUser()

  const practice = await prisma.practice.findFirst({ select: { id: true } })
  const creator = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'THERAPIST'] }, deletedAt: null },
    select: { id: true },
  })

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      supabaseUserId: authId,
      role: 'ATHLETE',
      name: NAME,
      firstName: 'Apple',
      lastName: 'Review',
      dpaAcceptedVersion: DPA_VERSION,
      dpaAcceptedAt: new Date(),
      practiceId: practice?.id ?? undefined,
      deletedAt: null,
    },
    create: {
      email: EMAIL,
      supabaseUserId: authId,
      role: 'ATHLETE',
      name: NAME,
      firstName: 'Apple',
      lastName: 'Review',
      dpaAcceptedVersion: DPA_VERSION,
      dpaAcceptedAt: new Date(),
      practiceId: practice?.id ?? undefined,
    },
    select: { id: true },
  })
  console.log(`· Prisma User klaar (ATLEET, DPA ${DPA_VERSION} geaccepteerd)`)

  // Demo-programma (idempotent) zodat SCHEMA/sessie content hebben.
  const existingProg = await prisma.program.findFirst({
    where: { patientId: user.id, name: PROG_NAME },
    select: { id: true },
  })
  if (existingProg) {
    console.log('· Demo-programma bestond al — overgeslagen')
  } else if (!creator) {
    console.log('· Geen admin/therapist als creator gevonden — programma overgeslagen')
  } else {
    const exs = await prisma.exercise.findMany({
      orderBy: { createdAt: 'asc' },
      take: 4,
      select: { id: true },
    })
    if (exs.length === 0) {
      console.log('· Geen oefeningen in de database — programma overgeslagen')
    } else {
      const days = [1, 3, 5] // ma / wo / vr
      const rows = [] as {
        exerciseId: string; week: number; day: number; order: number;
        sets: number; reps: number; repUnit: string; restTime: number;
      }[]
      for (let week = 1; week <= 4; week++) {
        for (const day of days) {
          exs.forEach((e, i) => {
            rows.push({ exerciseId: e.id, week, day, order: i, sets: 3, reps: 10, repUnit: 'reps', restTime: 60 })
          })
        }
      }
      await prisma.program.create({
        data: {
          name: PROG_NAME,
          description: 'Demo-schema voor de Apple App Review.',
          status: 'ACTIVE',
          type: 'STRENGTH',
          weeks: 4,
          daysPerWeek: 3,
          startDate: new Date(),
          creatorId: creator.id,
          patientId: user.id,
          practiceId: practice?.id ?? undefined,
          exercises: { create: rows },
        },
      })
      console.log(`· Demo-programma aangemaakt (${rows.length} oefening-rijen)`)
    }
  }

  console.log('\n✅ Klaar. Login voor de reviewer:')
  console.log(`   e-mail:    ${EMAIL}`)
  console.log(`   wachtwoord: ${PASSWORD}`)
}

main()
  .catch((e) => {
    console.error('❌ Mislukt:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
