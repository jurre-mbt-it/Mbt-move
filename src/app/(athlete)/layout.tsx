import { AthleteBottomNav } from '@/components/layout/AthleteBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'

export default function AthleteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16 overflow-x-hidden w-full" style={{ background: '#FAFAFA' }}>
      <main className="w-full overflow-x-hidden"><PageTransition>{children}</PageTransition></main>
      <AthleteBottomNav />
    </div>
  )
}
