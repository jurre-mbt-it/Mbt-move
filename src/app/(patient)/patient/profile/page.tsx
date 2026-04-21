'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function PatientProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUser({
          name: user.user_metadata?.name || user.email?.split('@')[0] || '',
          email: user.email || '',
        })
      }
    }
    loadUser()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '...'

  return (
    <DarkScreen>
      <DarkHeader title="Profiel" backHref="/patient/settings" />

      <div className="max-w-lg w-full mx-auto px-4 pt-4 pb-8 flex flex-col gap-4">
        {/* Avatar hero */}
        <div className="flex flex-col items-center gap-3 py-6">
          <div
            className="athletic-mono w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: P.lime,
              color: P.bg,
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: '0.04em',
            }}
          >
            {initials}
          </div>
          <div className="flex flex-col items-center gap-1">
            <Kicker>Patiënt</Kicker>
            <h1
              className="athletic-display"
              style={{
                color: P.ink,
                fontSize: 24,
                lineHeight: '28px',
                letterSpacing: '-0.02em',
                textAlign: 'center',
              }}
            >
              {(user?.name || '...').toUpperCase()}
            </h1>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>{user?.email || ''}</p>
          </div>
        </div>

        <Tile>
          <div className="flex flex-col gap-3">
            <MetaLabel>Mijn gegevens</MetaLabel>
            <InfoRow label="Naam" value={user?.name || '—'} />
            <InfoRow label="E-mail" value={user?.email || '—'} />
          </div>
        </Tile>

        <DarkButton variant="danger" onClick={handleSignOut}>
          UITLOGGEN
        </DarkButton>
      </div>
    </DarkScreen>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ borderBottom: `1px solid ${P.line}` }}
    >
      <span
        className="athletic-mono"
        style={{
          color: P.inkMuted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="truncate"
        style={{ color: P.ink, fontSize: 14, fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  )
}
