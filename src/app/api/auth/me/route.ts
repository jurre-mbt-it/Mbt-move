import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { DPA_VERSION } from '@/lib/dpa-constants'

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

    // DB is authoritative. Zelfde precedentie als resolveUser in src/server/trpc.ts:
    // eerst op supabaseUserId; email-fallback alleen voor legacy rows die nog
    // niet aan een (andere) Supabase-account gebonden zijn — anders zou een
    // email-change op Supabase-niveau hier andermans rol/metadata opleveren.
    const select = {
      role: true,
      name: true,
      mfaEnabled: true,
      dpaAcceptedVersion: true,
      dpaAcceptedAt: true,
      supabaseUserId: true,
    } as const
    let dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select,
    })
    if (!dbUser && user.email) {
      const byEmail = await prisma.user.findUnique({ where: { email: user.email }, select })
      if (byEmail && (!byEmail.supabaseUserId || byEmail.supabaseUserId === user.id)) {
        dbUser = byEmail
      }
    }

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
      mfaEnabled: !!dbUser?.mfaEnabled,
      dpaAccepted: dbUser?.dpaAcceptedVersion === DPA_VERSION,
      dpaAcceptedAt: dbUser?.dpaAcceptedAt?.toISOString() ?? null,
    })
  } catch {
    return NextResponse.json({ role: null }, { status: 500 })
  }
}
