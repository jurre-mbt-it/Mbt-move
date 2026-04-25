import { PatientBottomNav } from '@/components/layout/PatientBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="athletic-dark min-h-screen flex flex-col pb-16"
      style={{ background: '#0A0E0F', color: '#F5F7F6' }}
    >
      <main className="flex-1"><PageTransition>{children}</PageTransition></main>
      <PatientBottomNav />
      <BetaDisclaimer />
    </div>
  )
}
