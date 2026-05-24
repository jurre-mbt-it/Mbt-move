/**
 * Centrale post-login routing. Wordt gebruikt door /auth/callback, LoginForm
 * (na OTP-verify), MfaEnrollForm en MfaChallenge — zodat de volgorde van
 * verplichte stappen (MFA-enroll → MFA-challenge → DPA → dashboard) overal
 * gelijk is.
 *
 * Werkt client-side (Supabase client + fetch op /api/auth/me).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type PostLoginInfo = {
  role: string | null
  mfaEnabled: boolean
  dpaAccepted: boolean
}

function roleDashboard(role?: string | null): string {
  if (role === 'PATIENT') return '/patient/dashboard'
  if (role === 'ATHLETE') return '/athlete/dashboard'
  return '/therapist/dashboard'
}

function isSafeNext(next: string | null | undefined): next is string {
  if (!next) return false
  // Sanity-limit op lengte; voorkomt absurde redirects en DoS via lange URLs.
  if (next.length > 1024) return false
  // Eerste karakter moet `/` zijn, tweede mag niet `/` of `\` zijn
  // (anders is het een protocol-relative URL of een back-slash schema).
  if (!/^\/[^/\\]/.test(next)) return false
  // Geen whitespace of HTML-confusing tekens — voorkomt header-injection
  // en open-redirect-omzeiling via padding-tricks. Audit M2.
  if (/[\s<>"`]/.test(next)) return false
  return true
}

/**
 * Bepaalt de volgende URL na een succesvolle login of stap in de onboarding.
 *
 * Volgorde:
 *  1. Therapeut/admin zonder MFA      → /mfa/enroll?required=1
 *  2. Therapeut/admin met MFA, AAL1  → /mfa/challenge
 *  3. Patient/athlete zonder DPA      → /onboarding/dpa
 *  4. Anders                          → role-specifiek dashboard (of ?next=)
 */
export async function resolvePostLoginRedirect(
  supabase: SupabaseClient,
  options: { next?: string | null } = {},
): Promise<string> {
  // Rol + MFA + DPA in één call (server bepaalt waarheid uit DB).
  let info: PostLoginInfo = { role: null, mfaEnabled: false, dpaAccepted: false }
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      info = {
        role: data.role ?? null,
        mfaEnabled: !!data.mfaEnabled,
        dpaAccepted: !!data.dpaAccepted,
      }
    }
  } catch {
    /* val terug op defaults — gate kiest dan veilig MFA/DPA */
  }

  const isStaff = info.role === 'THERAPIST' || info.role === 'ADMIN'

  if (isStaff && !info.mfaEnabled) {
    return '/mfa/enroll?required=1'
  }

  if (isStaff && info.mfaEnabled) {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (data?.currentLevel !== 'aal2' && data?.nextLevel === 'aal2') {
        return '/mfa/challenge'
      }
    } catch {
      /* Als AAL-call faalt, ga conservatief naar challenge */
      return '/mfa/challenge'
    }
  }

  if (!isStaff && !info.dpaAccepted) {
    return '/onboarding/dpa'
  }

  return isSafeNext(options.next) ? options.next : roleDashboard(info.role)
}
