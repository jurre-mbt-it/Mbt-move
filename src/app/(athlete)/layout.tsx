import { AthleteBottomNav } from '@/components/layout/AthleteBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'
import { PersonalModeBanner } from '@/components/layout/PersonalModeBanner'
import { requireAthleteAccess } from '@/lib/auth/require-role'

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Laat echte ATHLETE-users binnen, én THERAPIST/ADMIN in persoonlijke modus.
  const session = await requireAthleteAccess()

  return (
    <div
      className="athletic-dark min-h-screen pb-16 overflow-x-hidden w-full"
      style={{ background: 'var(--p-bg)', color: 'var(--p-ink)' }}
    >
      {session.isTherapistPersonalMode && <PersonalModeBanner />}
      <main className="w-full overflow-x-hidden"><PageTransition>{children}</PageTransition></main>
      <AthleteBottomNav personalMode={session.isTherapistPersonalMode} />
      <BetaDisclaimer />
    </div>
  )
}
