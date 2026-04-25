'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { trpc } from '@/lib/trpc/client'
import { P } from '@/components/dark-ui'
import { BetaDisclaimer } from '@/components/system/BetaDisclaimer'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: me, isLoading } = trpc.auth.getMe.useQuery()

  useEffect(() => {
    if (!isLoading && me && me.role !== 'ADMIN') {
      router.replace('/therapist/dashboard')
    }
    if (!isLoading && !me) {
      router.replace('/login')
    }
  }, [me, isLoading, router])

  // Render niets tot we weten wie de user is (voorkomt flash van admin-content)
  if (isLoading || !me || me.role !== 'ADMIN') {
    return (
      <div
        className="athletic-dark min-h-screen flex items-center justify-center"
        style={{ background: P.bg, color: P.ink }}
      >
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
          LADEN…
        </span>
      </div>
    )
  }

  return (
    <div
      className="athletic-dark min-h-screen flex flex-col"
      style={{ background: P.bg, color: P.ink }}
    >
      <Header title="Admin" />
      <main className="flex-1 p-6" style={{ background: P.bg }}>
        {children}
      </main>
      <BetaDisclaimer />
    </div>
  )
}
