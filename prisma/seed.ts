import { PrismaClient, UserRole, ExerciseCategory, BodyRegion, LoadType, MovementPattern } from '@prisma/client'
import { STANDARD_EXERCISES } from './seed-exercises'
import { PROGRESSION_CHAINS } from './exercise-progressions'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

async function main() {
  console.log('Seeding database...')

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mbtmove.com' },
    update: {},
    create: {
      email: 'admin@mbtmove.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
    },
  })
  console.log('Created admin:', admin.email)

  // Therapists
  const therapist1 = await prisma.user.upsert({
    where: { email: 'sarah.chen@mbtmove.com' },
    update: {},
    create: {
      email: 'sarah.chen@mbtmove.com',
      name: 'Sarah Chen',
      role: UserRole.THERAPIST,
      specialty: 'Sports Rehabilitation',
      bio: 'Specialist in ACL reconstruction and return-to-sport protocols with 10 years of experience.',
      licenseNumber: 'PT-12345',
    },
  })

  const therapist2 = await prisma.user.upsert({
    where: { email: 'james.okafor@mbtmove.com' },
    update: {},
    create: {
      email: 'james.okafor@mbtmove.com',
      name: 'James Okafor',
      role: UserRole.THERAPIST,
      specialty: 'Spinal & Postural Rehab',
      bio: 'Expert in lumbar and cervical spine rehabilitation and postural correction.',
      licenseNumber: 'PT-67890',
    },
  })
  console.log('Created therapists:', therapist1.email, therapist2.email)

  // Patients
  const patient1 = await prisma.user.upsert({
    where: { email: 'alex.rivera@example.com' },
    update: {},
    create: {
      email: 'alex.rivera@example.com',
      name: 'Alex Rivera',
      role: UserRole.PATIENT,
      phone: '+1-555-0101',
    },
  })

  const patient2 = await prisma.user.upsert({
    where: { email: 'morgan.lee@example.com' },
    update: {},
    create: {
      email: 'morgan.lee@example.com',
      name: 'Morgan Lee',
      role: UserRole.PATIENT,
      phone: '+1-555-0102',
    },
  })

  const patient3 = await prisma.user.upsert({
    where: { email: 'taylor.kim@example.com' },
    update: {},
    create: {
      email: 'taylor.kim@example.com',
      name: 'Taylor Kim',
      role: UserRole.PATIENT,
      phone: '+1-555-0103',
    },
  })
  console.log('Created patients:', patient1.email, patient2.email, patient3.email)

  // Patient-therapist relationships
  await prisma.patientTherapist.upsert({
    where: { therapistId_patientId: { therapistId: therapist1.id, patientId: patient1.id } },
    update: {},
    create: { therapistId: therapist1.id, patientId: patient1.id, notes: 'ACL recovery' },
  })
  await prisma.patientTherapist.upsert({
    where: { therapistId_patientId: { therapistId: therapist1.id, patientId: patient2.id } },
    update: {},
    create: { therapistId: therapist1.id, patientId: patient2.id, notes: 'Shoulder impingement' },
  })
  await prisma.patientTherapist.upsert({
    where: { therapistId_patientId: { therapistId: therapist2.id, patientId: patient3.id } },
    update: {},
    create: { therapistId: therapist2.id, patientId: patient3.id, notes: 'Chronic lower back pain' },
  })

  // Sample exercises
  const exercises = [
    {
      name: 'Glute Bridge',
      description: 'A fundamental exercise for hip extension and posterior chain activation.',
      category: ExerciseCategory.STRENGTH,
      bodyRegion: [BodyRegion.HIP, BodyRegion.LUMBAR],
      instructions: [
        'Lie on your back with knees bent, feet flat on the floor hip-width apart.',
        'Press through your heels and squeeze your glutes to lift your hips.',
        'Hold at the top for 2 seconds, then lower with control.',
      ],
      tips: ['Keep your core braced throughout', 'Avoid arching your lower back at the top'],
      isPublic: true,
      createdById: therapist1.id,
    },
    {
      name: 'Wall Sit',
      description: 'Isometric quad strengthening for knee rehabilitation.',
      category: ExerciseCategory.STRENGTH,
      bodyRegion: [BodyRegion.KNEE, BodyRegion.HIP],
      instructions: [
        'Stand with your back flat against a wall.',
        'Slide down until your thighs are parallel to the floor.',
        'Hold the position, keeping your knees over your ankles.',
      ],
      tips: ['Keep feet flat on the floor', 'Do not let knees cave inward'],
      isPublic: true,
      createdById: therapist1.id,
    },
    {
      name: 'Cat-Cow Stretch',
      description: 'Spinal mobility exercise to reduce stiffness and improve range of motion.',
      category: ExerciseCategory.MOBILITY,
      bodyRegion: [BodyRegion.LUMBAR, BodyRegion.THORACIC],
      instructions: [
        'Start on hands and knees in a tabletop position.',
        'Inhale, drop your belly, lift your head and tailbone (Cow).',
        'Exhale, round your spine toward the ceiling, tuck chin and tailbone (Cat).',
        'Flow smoothly between the two positions.',
      ],
      tips: ['Move with your breath', 'Keep elbows straight throughout'],
      isPublic: true,
      createdById: therapist2.id,
    },
    {
      name: 'Single-Leg Balance',
      description: 'Proprioception and ankle stability drill.',
      category: ExerciseCategory.STABILITY,
      bodyRegion: [BodyRegion.ANKLE, BodyRegion.KNEE],
      instructions: [
        'Stand near a wall for safety.',
        'Lift one foot slightly off the ground.',
        'Maintain balance for the prescribed time.',
        'Progress by closing eyes or standing on an unstable surface.',
      ],
      tips: ['Focus on a fixed point to help balance', 'Keep a slight bend in the standing knee'],
      isPublic: true,
      createdById: therapist1.id,
    },
    {
      name: 'Shoulder External Rotation (Band)',
      description: 'Rotator cuff strengthening for shoulder stability.',
      category: ExerciseCategory.STRENGTH,
      bodyRegion: [BodyRegion.SHOULDER],
      instructions: [
        'Attach a resistance band at elbow height.',
        'Stand sideways to the anchor, elbow bent 90°.',
        'Keeping elbow at your side, rotate your forearm outward.',
        'Return with control.',
      ],
      tips: ['Keep elbow pinned to your side', 'Control the return phase — do not let it snap back'],
      isPublic: true,
      createdById: therapist2.id,
    },
  ]

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { id: (await prisma.exercise.findFirst({ where: { name: ex.name } }))?.id ?? 'nonexistent' },
      update: {},
      create: ex,
    })
  }
  console.log(`Created ${exercises.length} sample exercises`)

  // Standard exercise database — UPSERT met evidence-based EMG data
  let standardCreated = 0
  let standardUpdated = 0
  for (const stdEx of STANDARD_EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: stdEx.name, mode: 'insensitive' } },
    })

    if (existing) {
      // Alleen updaten als deze door admin is aangemaakt (user-created exercises niet overschrijven)
      if (existing.createdById !== admin.id) continue

      // Update bestaande oefening met evidence-based data
      await prisma.muscleLoad.deleteMany({ where: { exerciseId: existing.id } })
      await prisma.exercise.update({
        where: { id: existing.id },
        data: {
          description: stdEx.description,
          category: stdEx.category as ExerciseCategory,
          bodyRegion: stdEx.bodyRegion as BodyRegion[],
          difficulty: stdEx.difficulty as never,
          loadType: stdEx.loadType as LoadType,
          isUnilateral: stdEx.isUnilateral,
          movementPattern: stdEx.movementPattern as MovementPattern | null,
          instructions: stdEx.instructions,
          tags: stdEx.tags,
          muscleLoads: {
            create: Object.entries(stdEx.muscleLoads).map(([muscle, load]) => ({
              muscle,
              load,
            })),
          },
        },
      })
      standardUpdated++
    } else {
      await prisma.exercise.create({
        data: {
          name: stdEx.name,
          description: stdEx.description,
          category: stdEx.category as ExerciseCategory,
          bodyRegion: stdEx.bodyRegion as BodyRegion[],
          difficulty: stdEx.difficulty as never,
          loadType: stdEx.loadType as LoadType,
          isUnilateral: stdEx.isUnilateral,
          movementPattern: stdEx.movementPattern as MovementPattern | null,
          instructions: stdEx.instructions,
          tags: stdEx.tags,
          isPublic: true,
          createdById: admin.id,
          muscleLoads: {
            create: Object.entries(stdEx.muscleLoads).map(([muscle, load]) => ({
              muscle,
              load,
            })),
          },
        },
      })
      standardCreated++
    }
  }
  console.log(`Standard exercises: ${standardCreated} created, ${standardUpdated} updated`)

  // ───────────────────────────────────────────────────────────────────────────
  // Pass 2: Progressie/regressie links koppelen op basis van PROGRESSION_CHAINS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('Linking progression/regression variants...')
  const allExercises = await prisma.exercise.findMany({
    where: { isPublic: true },
    select: { id: true, name: true },
  })
  const byName = new Map(allExercises.map(e => [e.name.toLowerCase(), e.id]))

  let linksCreated = 0
  let linksSkipped = 0
  for (const chain of PROGRESSION_CHAINS) {
    for (let i = 0; i < chain.length; i++) {
      const currentId = byName.get(chain[i].toLowerCase())
      if (!currentId) {
        linksSkipped++
        continue
      }
      const easierId = i > 0 ? byName.get(chain[i - 1].toLowerCase()) ?? null : null
      const harderId = i < chain.length - 1 ? byName.get(chain[i + 1].toLowerCase()) ?? null : null
      await prisma.exercise.update({
        where: { id: currentId },
        data: {
          easierVariantId: easierId,
          harderVariantId: harderId,
        },
      })
      linksCreated++
    }
  }
  console.log(`Progression links: ${linksCreated} configured, ${linksSkipped} skipped (exercise not found)`)

  // ───────────────────────────────────────────────────────────────────────────
  // CIE — insight_rules seed (6 rules v1)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('Seeding Clinical Insight Engine rules...')
  const INSIGHT_RULES = [
    {
      signalType: 'pain_flare',
      category: 'pain',
      defaultUrgency: 'HIGH' as const,
      defaultConfig: {
        deltaAbove: 2, // NRS points above baseline
        recentSessions: 3,
        baselineWindowDays: 14,
      },
      evidenceRefs: [
        'Silbernagel KG, Thomeé R, Thomeé P, Karlsson J. Eccentric overload training for patients with chronic Achilles tendon pain. Scand J Med Sci Sports 2001.',
        'Smith BE et al. Musculoskeletal pain and exercise-prescribing load. BJSM 2017 — pain-monitoring-model.',
      ],
    },
    {
      signalType: 'pain_red_flag',
      category: 'pain',
      defaultUrgency: 'CRITICAL' as const,
      defaultConfig: {
        singleSessionThreshold: 8, // NRS >= 8 single session
        consecutiveSessionsThreshold: 6, // NRS >= 6 on 2 consecutive sessions
        consecutiveSessionsCount: 2,
        dedupHours: 24,
      },
      evidenceRefs: [
        'Thomeé R. A comprehensive treatment approach for patellofemoral pain syndrome. Phys Ther 1997.',
      ],
    },
    {
      signalType: 'ready_for_progression',
      category: 'progression',
      defaultUrgency: 'LOW' as const,
      defaultConfig: {
        painBelow: 3, // NRS < 3
        feedbackPositiveThreshold: 2, // painLevel <= 2 counts as positive smiley
        recentSessions: 3,
        adherencePct: 80,
        adherenceWindowDays: 7,
      },
      evidenceRefs: [
        'Saragiotto BT, Maher CG et al. Motor control exercise for chronic low back pain. Cochrane 2016 — progressive overload principle.',
      ],
    },
    {
      signalType: 'plateau',
      category: 'progression',
      defaultUrgency: 'LOW' as const,
      defaultConfig: {
        daysWithoutChange: 14,
        metrics: ['pain', 'smiley', 'load'],
      },
      evidenceRefs: [
        'Bourdon PC et al. Monitoring athlete training loads: consensus statement. IJSPP 2017 — stagnation detection.',
      ],
    },
    {
      signalType: 'adherence_drop',
      category: 'adherence',
      defaultUrgency: 'MEDIUM' as const,
      defaultConfig: {
        recentWindowDays: 7,
        baselineWindowDays: 14,
        dropRatio: 0.5, // recent < 50% of baseline
        silentDays: 5, // or: no sessions in 5+ days
      },
      evidenceRefs: [
        'Jack K et al. Barriers to treatment adherence in physiotherapy outpatient clinics. Man Ther 2010.',
      ],
    },
    {
      signalType: 'exercise_specific_pain',
      category: 'pattern',
      defaultUrgency: 'MEDIUM' as const,
      defaultConfig: {
        deltaAbove: 2, // NRS points above other exercises avg
        minExecutions: 3,
      },
      evidenceRefs: [
        'Cook JL, Purdam CR. Is tendon pathology a continuum? BJSM 2009 — pattern-recognition in tendinopathy.',
      ],
    },
    {
      signalType: 'deload_needed',
      category: 'progression',
      defaultUrgency: 'MEDIUM' as const,
      defaultConfig: {
        painAbove: 5, // session NRS >= 5
        recentSessions: 3, // over de laatste N sessies
      },
      evidenceRefs: [
        'Haff GG, Triplett NT. Essentials of Strength Training and Conditioning, 4e. NSCA — deload/unload principles.',
        'Stone MH et al. Principles of deloading in resistance training. Strength & Conditioning Journal 1982.',
      ],
    },
  ]

  let rulesCreated = 0
  let rulesUpdated = 0
  for (const rule of INSIGHT_RULES) {
    const existing = await prisma.insightRule.findUnique({ where: { signalType: rule.signalType } })
    if (existing) {
      await prisma.insightRule.update({
        where: { signalType: rule.signalType },
        data: {
          category: rule.category,
          defaultUrgency: rule.defaultUrgency,
          defaultConfig: rule.defaultConfig,
          evidenceRefs: rule.evidenceRefs,
        },
      })
      rulesUpdated++
    } else {
      await prisma.insightRule.create({
        data: {
          signalType: rule.signalType,
          category: rule.category,
          defaultUrgency: rule.defaultUrgency,
          defaultConfig: rule.defaultConfig,
          evidenceRefs: rule.evidenceRefs,
          enabledGlobally: true,
        },
      })
      rulesCreated++
    }
  }
  console.log(`Insight rules: ${rulesCreated} created, ${rulesUpdated} updated`)

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
