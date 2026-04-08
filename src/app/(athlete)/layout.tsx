import { AthleteBottomNav } from '@/components/layout/AthleteBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'

export default function AthleteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen pb-16" style={{ background: '#FAFAFA' }}>
      <main><PageTransition>{children}</PageTransition></main>
      <AthleteBottomNav />
    </div>
  )
}
