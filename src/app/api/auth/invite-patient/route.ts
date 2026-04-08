import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { email, name, role: requestedRole, resend } = await request.json()

  if (!email || !name) {
    return NextResponse.json({ error: 'Email en naam zijn verplicht' }, { status: 400 })
  }

  const validRoles = ['PATIENT', 'THERAPIST', 'ATHLETE'] as const
  const role = validRoles.includes(requestedRole) ? requestedRole : 'PATIENT'

  // Get the current therapist
  const supabase = await createServerClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser?.email) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const therapist = await prisma.user.findUnique({
    where: { email: currentUser.email },
    select: { id: true, role: true },
  })
  if (!therapist || (therapist.role !== 'THERAPIST' && therapist.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Geen therapeut' }, { status: 403 })
  }

  // If resend: delete the existing Supabase auth user first so we can re-invite
  if (resend) {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = users.find(u => u.email === email)
    if (existingUser) {
      await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
    }
  }

  // Invite via Supabase Auth (sends actual email)
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role, name },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/auth/callback`,
  })

  if (error) {
    if (!resend && (error.message.includes('already') || error.message.includes('exists'))) {
      return NextResponse.json(
        { error: 'Deze gebruiker bestaat al.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Create/update patient in our database
  const patient = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      id: data.user.id,
      email,
      name,
      role,
    },
  })

  // Create therapist-patient relationship (only for patient/athlete roles)
  if (role === 'PATIENT' || role === 'ATHLETE') await prisma.patientTherapist.upsert({
    where: {
      therapistId_patientId: {
        therapistId: therapist.id,
        patientId: patient.id,
      },
    },
    update: { isActive: true },
    create: {
      therapistId: therapist.id,
      patientId: patient.id,
    },
  })

  return NextResponse.json({ success: true, resent: !!resend })
}
