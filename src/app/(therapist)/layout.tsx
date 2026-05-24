import { TherapistSidebar } from '@/components/layout/TherapistSidebar'
import { TherapistBottomNav } from '@/components/layout/TherapistBottomNav'
import { Header } from '@/components/layout/Header'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'
import { WhatsNewModal } from '@/components/system/WhatsNewModal'
import { requireRole } from '@/lib/auth/require-role'

export default async function TherapistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side role-guard. ADMIN mag meekijken (zelfde patroon als
  // therapistProcedure in tRPC). Patient/athlete worden naar hun eigen
  // dashboard gestuurd voordat de shell überhaupt rendert.
  await requireRole(['THERAPIST', 'ADMIN'])

  return (
    <div
      className="athletic-dark flex h-screen overflow-hidden"
      style={{ background: '#0A0E0F', color: '#F5F7F6' }}
    >
      {/* Sidebar: alleen op desktop */}
      <div className="hidden md:flex">
        <TherapistSidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {/* Extra padding-bottom op mobiel voor bottom nav */}
        <main
          className="flex-1 overflow-y-auto px-4 pt-4 pb-24 md:px-8 md:pt-6 md:pb-8"
          style={{ background: '#0A0E0F' }}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* Bottom nav: alleen op mobiel */}
      <TherapistBottomNav />
      <BetaDisclaimer />
      <WhatsNewModal />
    </div>
  )
}
