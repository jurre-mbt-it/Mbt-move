import { AthleteBottomNav } from '@/components/layout/AthleteBottomNav'
import { PageTransition } from '@/components/layout/PageTransition'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'

export default function AthleteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="athletic-dark min-h-screen pb-16 overflow-x-hidden w-full"
      style={{ background: '#0A0E0F', color: '#F5F7F6' }}
    >
      <main className="w-full overflow-x-hidden"><PageTransition>{children}</PageTransition></main>
      <AthleteBottomNav />
      <BetaDisclaimer />
    </div>
  )
}
