import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const ALLOWED_SELF_SIGNUP_ROLES = new Set(['THERAPIST', 'ATHLETE'])

/**
 * Bind een net-aangemaakte Supabase auth-account aan een Prisma user-row.
 *
 * Identity (id/email) komt UITSLUITEND uit de geverifieerde Supabase-sessie,
 * nooit uit de request body — anders kan iedereen op het internet een
 * willekeurige user-row aanmaken/overschrijven (PRE-LAUNCH security fix).
 *
 * Body mag alleen `name` en `role` bevatten:
 *   - role wordt gevalideerd tegen ALLOWED_SELF_SIGNUP_ROLES (THERAPIST/ATHLETE).
 *     PATIENT-rows worden uitsluitend via invite.finalize aangemaakt.
 *     ADMIN kan nooit via deze route.
 *
 * Bestaande Prisma rows worden NIET overschreven — alleen create-if-missing.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedRole = typeof body?.role === 'string' ? body.role : undefined
    const safeRole = requestedRole && ALLOWED_SELF_SIGNUP_ROLES.has(requestedRole)
      ? requestedRole
      : 'THERAPIST'
    const safeName = typeof body?.name === 'string' && body.name.trim().length > 0
      ? body.name.trim().slice(0, 200)
      : authUser.email.split('@')[0]

    // Bestaande row laten staan — voorkomt role-overwrite via deze route.
    // Wel even supabaseUserId backfillen als die nog leeg is en de row van
    // dezelfde Supabase-user is (matcht email + nog geen andere binding).
    const existing = await prisma.user.findUnique({ where: { email: authUser.email } })
    if (existing) {
      if (!existing.supabaseUserId) {
        try {
          await prisma.user.update({
            where: { id: existing.id },
            data: { supabaseUserId: authUser.id },
          })
        } catch {
          // unique constraint — andere row heeft 'm al; negeren.
        }
      }
      return NextResponse.json({ success: true, existed: true })
    }

    await prisma.user.create({
      data: {
        email: authUser.email,
        supabaseUserId: authUser.id,
        name: safeName,
        role: safeRole as 'THERAPIST' | 'ATHLETE',
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('sync-user exception:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
