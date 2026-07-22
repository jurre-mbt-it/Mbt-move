import { PatientBottomNav } from '@/components/layout/PatientBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'
import { requireRole } from '@/lib/auth/require-role'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole('PATIENT')

  return (
    <div
      className="athletic-dark min-h-screen flex flex-col pb-16"
      style={{ background: '#0E2729', color: '#F5F2ED' }}
    >
      <main className="flex-1"><PageTransition>{children}</PageTransition></main>
      <PatientBottomNav />
      <BetaDisclaimer />
    </div>
  )
}
