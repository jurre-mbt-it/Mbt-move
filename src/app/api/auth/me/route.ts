import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
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

    // Get role from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, name: true },
    })

    return NextResponse.json({
      role: dbUser?.role || user.user_metadata?.role || null,
      name: dbUser?.name || user.user_metadata?.name || null,
    })
  } catch {
    return NextResponse.json({ role: null }, { status: 500 })
  }
}
