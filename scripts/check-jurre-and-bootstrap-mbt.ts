/**
 * 1. Check Jurre's role + practice op prod
 * 2. Promote to ADMIN if nodig
 * 3. Maak 'Movement Based Therapy' praktijk aan (als nog niet bestaat)
 * 4. Koppel Jurre + andere THERAPISTS + hun patients eraan
 * 5. Zet cieEnabled = true op de praktijk
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

const JURRE_EMAIL = 'jurre@movementbasedtherapy.nl'
const PRACTICE_NAME = 'Movement Based Therapy'

async function main() {
  // 1. Find Jurre
  const jurre = await prisma.user.findUnique({
    where: { email: JURRE_EMAIL },
    select: { id: true, email: true, role: true, practiceId: true, mfaEnabled: true },
  })
  if (!jurre) {
    console.error(`Gebruiker ${JURRE_EMAIL} niet gevonden op prod.`)
    process.exit(1)
  }
  console.log(`Jurre gevonden: role=${jurre.role}, practiceId=${jurre.practiceId}, mfa=${jurre.mfaEnabled}`)

  // 2. Promote to ADMIN if niet al
  if (jurre.role !== 'ADMIN') {
    await prisma.user.update({
      where: { id: jurre.id },
      data: { role: 'ADMIN' },
    })
    console.log(`Rol bijgewerkt: ${jurre.role} → ADMIN`)
  } else {
    console.log('Jurre was al ADMIN.')
  }

  // 3. Create or find practice
  let practice = await prisma.practice.findFirst({
    where: { name: { contains: 'Movement Based Therapy', mode: 'insensitive' } },
  })
  if (!practice) {
    practice = await prisma.practice.create({
      data: { name: PRACTICE_NAME, cieEnabled: true },
    })
    console.log(`Praktijk aangemaakt: ${practice.name} (${practice.id})`)
  } else {
    await prisma.practice.update({
      where: { id: practice.id },
      data: { cieEnabled: true },
    })
    console.log(`Praktijk bestond al: ${practice.name} (${practice.id}) — cieEnabled nu true`)
  }

  // 4. Link Jurre to practice
  await prisma.user.update({
    where: { id: jurre.id },
    data: { practiceId: practice.id },
  })
  console.log(`Jurre gekoppeld aan praktijk.`)

  // 5. Link alle THERAPISTS zonder practiceId
  const therapistsWithoutPractice = await prisma.user.findMany({
    where: { role: 'THERAPIST', practiceId: null },
    select: { id: true, email: true, name: true },
  })
  if (therapistsWithoutPractice.length > 0) {
    await prisma.user.updateMany({
      where: { role: 'THERAPIST', practiceId: null },
      data: { practiceId: practice.id },
    })
    console.log(`${therapistsWithoutPractice.length} therapeut(en) gekoppeld aan praktijk:`)
    therapistsWithoutPractice.forEach((t) => console.log(`  - ${t.email}`))
  }

  // 6. Link alle PATIENTS + ATHLETES zonder practiceId aan de praktijk
  const clientsWithoutPractice = await prisma.user.count({
    where: { role: { in: ['PATIENT', 'ATHLETE'] }, practiceId: null },
  })
  if (clientsWithoutPractice > 0) {
    await prisma.user.updateMany({
      where: { role: { in: ['PATIENT', 'ATHLETE'] }, practiceId: null },
      data: { practiceId: practice.id },
    })
    console.log(`${clientsWithoutPractice} client(s) (PATIENT/ATHLETE) gekoppeld aan praktijk.`)
  }

  // 7. Final status
  const counts = await prisma.user.groupBy({
    by: ['role'],
    where: { practiceId: practice.id },
    _count: { _all: true },
  })
  console.log(`\nEindstatus "${practice.name}":`)
  counts.forEach((c) => console.log(`  ${c.role}: ${c._count._all}`))
  console.log(`\nJurre kan nu /admin/dashboard openen.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
