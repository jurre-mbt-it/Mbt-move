'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DarkButton, DarkInput, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { IncompletePracticeBanner } from '@/components/practice/IncompletePracticeBanner'

export default function ProfilePage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: me, isLoading } = trpc.auth.getMe.useQuery()
  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.getMe.invalidate()
      toast.success('Profiel opgeslagen')
    },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (!me) return
    setFirstName(me.firstName ?? '')
    setLastName(me.lastName ?? '')
    setJobTitle(me.jobTitle ?? '')
    setPhone(me.phone ?? '')
  }, [me])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) {
      toast.error('Voornaam is verplicht')
      return
    }
    await updateMutation.mutateAsync({
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      jobTitle: jobTitle.trim() || null,
      phone: phone.trim() || null,
    })
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
          Persoonlijke gegevens en functietitel voor email-footer
        </MetaLabel>
      </div>

      <IncompletePracticeBanner />

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <Tile>
          <MetaLabel>Persoonlijk</MetaLabel>
          <div className="flex flex-col gap-3 mt-3">
            <Field label="Voornaam *">
              <DarkInput
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Jurre"
                disabled={isLoading}
              />
            </Field>
            <Field label="Achternaam">
              <DarkInput
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="van Putten"
                disabled={isLoading}
              />
            </Field>
            <Field label="Functietitel">
              <DarkInput
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="Sportfysiotherapeut"
                disabled={isLoading}
              />
              <span className="text-[11px] mt-0.5" style={{ color: P.inkMuted }}>
                Wordt onder je naam getoond in de email-footer.
              </span>
            </Field>
            <Field label="Telefoon">
              <DarkInput
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="06 12345678"
                disabled={isLoading}
              />
            </Field>
          </div>
        </Tile>

        <Tile>
          <MetaLabel>Accountgegevens</MetaLabel>
          <div className="flex flex-col gap-3 mt-3">
            <InfoRow label="E-mail" value={me?.email ?? '—'} />
            <InfoRow
              label="Praktijk"
              value={me?.practiceId ? (me.practiceName ?? '—') : 'Niet gekoppeld'}
              href={me?.practiceId ? '/therapist/settings/practice' : undefined}
            />
            {me?.isPracticeOwner && (
              <InfoRow label="Rol in praktijk" value="Eigenaar" />
            )}
          </div>
        </Tile>

        <DarkButton type="submit" variant="primary" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Opslaan…' : 'Opslaan'}
        </DarkButton>
      </form>

      <DarkButton variant="danger" onClick={handleSignOut}>
        Uitloggen
      </DarkButton>
    </div>
  )
}

function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function InfoRow({
  label, value, href,
}: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {label}
      </span>
      <span style={{ color: P.ink, fontSize: 14, fontWeight: 600 }}>{value}</span>
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        className="flex items-baseline justify-between gap-3 border-b pb-2 hover:opacity-80 transition-opacity"
        style={{ borderColor: P.line }}
      >
        {content}
      </Link>
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: P.line }}>
      {content}
    </div>
  )
}
