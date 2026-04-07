import { PatientBottomNav } from '@/components/layout/PatientBottomNav'

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16" style={{ background: '#FAFAFA' }}>
      <main>{children}</main>
      <PatientBottomNav />
    </div>
  )
}
