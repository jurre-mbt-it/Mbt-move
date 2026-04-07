import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { email, name } = await request.json()

  if (!email || !name) {
    return NextResponse.json({ error: 'Email en naam zijn verplicht' }, { status: 400 })
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role: 'PATIENT', name },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Also create the user row so the therapist can see them immediately
  await supabase.from('users').upsert({
    id: data.user.id,
    email,
    name,
    role: 'PATIENT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { onConflict: 'id' })

  return NextResponse.json({ success: true })
}
