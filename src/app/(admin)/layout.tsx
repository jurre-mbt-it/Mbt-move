import { Header } from '@/components/layout/Header'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'
import { requireRole } from '@/lib/auth/require-role'
import { P } from '@/components/dark-ui'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side role-guard. Niet-admins (incl. therapeuten) krijgen geen
  // toegang tot deze segment-tree; ze worden teruggestuurd naar hun eigen
  // dashboard voordat er iets rendert.
  await requireRole('ADMIN')

  return (
    <div
      className="athletic-dark min-h-screen flex flex-col"
      style={{ background: P.bg, color: P.ink }}
    >
      <Header title="Admin" />
      <main className="flex-1 p-6" style={{ background: P.bg }}>
        {children}
      </main>
      <BetaDisclaimer />
    </div>
  )
}
