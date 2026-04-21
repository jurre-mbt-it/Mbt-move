import { Header } from '@/components/layout/Header'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="athletic-dark min-h-screen flex flex-col"
      style={{ background: '#0A0E0F', color: '#F5F7F6' }}
    >
      <Header title="Admin" />
      <main className="flex-1 p-6" style={{ background: '#0A0E0F' }}>
        {children}
      </main>
    </div>
  )
}
