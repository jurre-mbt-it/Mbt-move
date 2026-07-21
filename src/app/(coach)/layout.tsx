import { TherapistSidebar } from '@/components/layout/TherapistSidebar'
import { CoachBottomNav } from '@/components/layout/CoachBottomNav'
import { Header } from '@/components/layout/Header'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'
import { requireRole } from '@/lib/auth/require-role'

/**
 * Coach-portaal: dezelfde shell als de therapeut, met een smallere navigatie.
 * Bewust GEEN ADMIN in de guard: een admin heeft zijn eigen portaal, en zo
 * blijft dit segment één rol met één set rechten. Zie
 * docs/plan-coach-role-20260721.md.
 */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['COACH'])

  return (
    <div
      className="athletic-dark flex h-screen overflow-hidden"
      style={{ background: '#0A0E0F', color: '#F5F7F6' }}
    >
      <div className="hidden md:flex">
        <TherapistSidebar variant="coach" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-y-auto px-4 pt-4 pb-24 md:px-8 md:pt-6 md:pb-8"
          style={{ background: '#0A0E0F' }}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <CoachBottomNav />
      <BetaDisclaimer />
    </div>
  )
}
