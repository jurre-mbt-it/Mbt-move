import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { id, email, name, role } = await request.json()

    if (!id || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase
      .from('users')
      .upsert({
        id,
        email,
        name: name || email.split('@')[0],
        role: role || 'THERAPIST',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (error) {
      console.error('sync-user error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('sync-user exception:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
