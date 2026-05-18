import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          set(_name: string, _value: string) {},
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          remove(_name: string) {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ role: null }, { status: 401 })
    }

    // DB is authoritative — match op supabaseUserId (kan afwijken van prisma.user.id
    // voor legacy rows), fallback op email.
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { supabaseUserId: user.id },
          ...(user.email ? [{ email: user.email }] : []),
        ],
      },
      select: { role: true, name: true },
    })

    // Self-heal: als user_metadata.role afwijkt van DB, sync 'm bij.
    // Zo blijven proxy/middleware en LoginForm (die user_metadata lezen)
    // altijd in sync met de waarheid uit Prisma — zonder DB-lookup in de
    // hot path van elke request.
    if (dbUser?.role && dbUser.role !== user.user_metadata?.role) {
      try {
        const supabaseAdmin = createSupabaseAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, role: dbUser.role },
        })
      } catch (e) {
        console.error('auth/me: failed to self-heal user_metadata.role', e)
      }
    }

    return NextResponse.json({
      role: dbUser?.role || user.user_metadata?.role || null,
      name: dbUser?.name || user.user_metadata?.name || null,
    })
  } catch {
    return NextResponse.json({ role: null }, { status: 500 })
  }
}
