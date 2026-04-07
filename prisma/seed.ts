import { PrismaClient, UserRole, ExerciseCategory, BodyRegion } from '@prisma/client'

const prisma = new PrismaClient()

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
      category: ExerciseCategory.BALANCE,
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
