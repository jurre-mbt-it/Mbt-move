'use client'

import { useRouter } from 'next/navigation'
import { ActionTile, DarkButton, Kicker, MetaLabel, P } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="max-w-lg w-full flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Kicker>Account</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          INSTELLINGEN
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Beheer je account en voorkeuren
        </MetaLabel>
      </div>

      <div className="flex flex-col gap-2">
        <ActionTile
          href="/therapist/settings/profile"
          label="Profiel"
          sub="Persoonlijke gegevens en accountinformatie"
          bar={P.lime}
        />
        <ActionTile
          href="/therapist/settings/parameters"
          label="Parameters"
          sub="Aangepaste meetparameters voor programma's"
          bar={P.ice}
        />
      </div>

      <DarkButton variant="danger" onClick={handleSignOut}>
        Uitloggen
      </DarkButton>
    </div>
  )
}
