import { PatientBottomNav } from '@/components/layout/PatientBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16" style={{ background: '#FAFAFA' }}>
      <main><PageTransition>{children}</PageTransition></main>
      <PatientBottomNav />
    </div>
  )
}
