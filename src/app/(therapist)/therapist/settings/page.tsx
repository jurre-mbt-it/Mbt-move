'use client'

import { useRouter } from 'next/navigation'
import { ActionTile, DarkButton, Kicker, MetaLabel, P } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { PrefToggleTile } from '@/components/settings/PrefToggleTile'
import { PREF_REST_TIMER_ENABLED } from '@/hooks/useLocalPref'

export default function SettingsPage() {
  const router = useRouter()
  const { data: mfa } = trpc.auth.mfaStatus.useQuery()
  const { data: me } = trpc.auth.getMe.useQuery()
  const isAdmin = me?.role === 'ADMIN'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const mfaSub = mfa?.enabled
    ? `MFA aan · ${mfa.backupCodesRemaining} backup-codes resterend${mfa.backupCodesRemaining < 3 ? ' — regenereer' : ''}`
    : mfa?.required
      ? 'MFA verplicht voor therapeuten — nu inschakelen'
      : 'Beveilig je account met Authenticator-app'
  const mfaBar =
    mfa?.enabled && mfa.backupCodesRemaining >= 3
      ? P.lime
      : mfa?.required && !mfa.enabled
        ? P.danger
        : P.gold

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

      <Kicker>Voorkeuren</Kicker>
      <PrefToggleTile
        prefKey={PREF_REST_TIMER_ENABLED}
        defaultValue={true}
        label="Rust-timer tussen sets"
        sub="Toon 60-seconden countdown na elke set"
      />

      <div className="flex flex-col gap-2">
        <ActionTile
          href="/therapist/settings/profile"
          label="Profiel"
          sub="Persoonlijke gegevens en accountinformatie"
          bar={P.lime}
        />
        <ActionTile
          href="/therapist/settings/security"
          label="Beveiliging & MFA"
          sub={mfaSub}
          bar={mfaBar}
        />
        <ActionTile
          href="/therapist/settings/parameters"
          label="Parameters"
          sub="Aangepaste meetparameters voor programma's"
          bar={P.ice}
        />
        {isAdmin && (
          <>
            <ActionTile
              href="/admin/dashboard"
              label="Admin-dashboard"
              sub="Beheer users, praktijken en protocollen"
              bar={P.lime}
            />
            <ActionTile
              href="/admin/users"
              label="Users & rollen"
              sub="Rollen wijzigen, aan praktijk koppelen"
              bar={P.ice}
            />
            <ActionTile
              href="/admin/practices"
              label="Praktijken"
              sub="Multi-tenant groepen beheren"
              bar={P.ice}
            />
            <ActionTile
              href="/admin/rehab-protocols"
              label="Revalidatie-protocollen"
              sub="Protocol-catalog + criteria bewerken"
              bar={P.purple}
            />
          </>
        )}
      </div>

      <DarkButton variant="danger" onClick={handleSignOut}>
        Uitloggen
      </DarkButton>
    </div>
  )
}
