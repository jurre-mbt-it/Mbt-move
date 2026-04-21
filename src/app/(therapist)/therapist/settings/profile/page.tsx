'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DarkButton, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="max-w-lg w-full flex flex-col gap-4">
      <Link
        href="/therapist/settings"
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
      >
        ← INSTELLINGEN
      </Link>

      <div className="flex flex-col gap-1">
        <Kicker>Account</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          PROFIEL
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Persoonlijke gegevens en accountinformatie
        </MetaLabel>
      </div>

      <Tile>
        <MetaLabel>Accountgegevens</MetaLabel>
        <div className="flex flex-col gap-3 mt-3">
          <InfoRow label="Naam" value="—" />
          <InfoRow label="E-mail" value="—" />
          <InfoRow label="Telefoon" value="—" />
          <InfoRow label="Praktijk" value="—" />
        </div>
      </Tile>

      <DarkButton variant="danger" onClick={handleSignOut}>
        Uitloggen
      </DarkButton>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: P.line }}>
      <span
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {label}
      </span>
      <span style={{ color: P.ink, fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
