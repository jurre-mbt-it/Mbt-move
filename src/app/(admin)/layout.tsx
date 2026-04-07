import { Header } from '@/components/layout/Header'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Admin" />
      <main className="flex-1 p-6" style={{ background: '#FAFAFA' }}>
        {children}
      </main>
    </div>
  )
}
