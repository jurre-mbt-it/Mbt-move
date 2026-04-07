import { TherapistSidebar } from '@/components/layout/TherapistSidebar'
import { Header } from '@/components/layout/Header'

export default function TherapistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <TherapistSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6" style={{ background: '#FAFAFA' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
