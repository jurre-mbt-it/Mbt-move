'use client'

/**
 * Meldingen-instellingen voor therapeut/coach/admin.
 *
 * Zelfde voorkeuren als het meldingen-blok in de mobiele app (push.getPreferences /
 * push.setPreferences), plus twee dingen die alleen hier zitten: de lijst met
 * geregistreerde toestellen en een testmelding. Die twee maken zichtbaar waar het
 * misgaat wanneer er niets binnenkomt — zonder testmelding kun je alleen wachten
 * tot de 09:00-cron toevallig iets te melden heeft.
 */
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'

type Category = 'message' | 'schedule' | 'reminder' | 'insight'

const CATEGORIES: { key: Category; label: string; sub: string }[] = [
  { key: 'message', label: 'Berichten', sub: 'Als iemand je een bericht stuurt' },
  { key: 'schedule', label: 'Nieuw schema', sub: 'Als er een nieuw schema voor je klaarstaat' },
  { key: 'reminder', label: 'Dagelijkse herinneringen', sub: 'Een herinnering aan je training van die dag' },
  { key: 'insight', label: 'Voortgang en herstel', sub: 'Signalen over je herstel en belasting' },
]

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="athletic-tap rounded-full transition-colors relative shrink-0 disabled:cursor-not-allowed"
      style={{
        width: 44,
        height: 26,
        opacity: disabled ? 0.4 : 1,
        background: checked ? P.brand : P.control,
        border: `1px solid ${checked ? P.brand : P.lineStrong}`,
      }}
    >
      <span
        aria-hidden
        className="block rounded-full transition-transform"
        style={{
          width: 20,
          height: 20,
          background: checked ? P.bg : P.inkMuted,
          transform: `translateX(${checked ? 20 : 2}px)`,
          marginTop: 2,
        }}
      />
    </button>
  )
}

function Row({
  label,
  sub,
  children,
}: {
  label: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{label}</p>
        <p
          className="athletic-mono"
          style={{
            color: P.inkMuted,
            fontSize: 11,
            letterSpacing: '0.04em',
            fontWeight: 500,
            marginTop: 2,
            textTransform: 'none',
          }}
        >
          {sub}
        </p>
      </div>
      {children}
    </div>
  )
}

export default function NotificationSettingsPage() {
  const portal = usePortal()
  const utils = trpc.useUtils()
  const { data: prefs, isLoading } = trpc.push.getPreferences.useQuery()
  const { data: devices } = trpc.push.devices.useQuery()
  const [result, setResult] = useState<string | null>(null)

  const save = trpc.push.setPreferences.useMutation({
    onSuccess: () => utils.push.getPreferences.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const sendTest = trpc.push.sendTest.useMutation({
    onSuccess: (r) => {
      utils.push.devices.invalidate()
      if (r.devices === 0) {
        setResult(
          'Geen toestel geregistreerd. Log in de app in op dit account en geef toestemming voor meldingen, dan verschijnt je toestel hier.',
        )
        return
      }
      if (r.delivered === 0) {
        const reason = [...r.errors, ...r.receiptErrors].join(', ') || 'onbekende fout'
        setResult(`Niet afgeleverd op ${r.devices} toestel(len). Melding van Expo: ${reason}.`)
        return
      }
      const parts = [`Verstuurd naar ${r.delivered} van ${r.devices} toestel(len).`]
      if (r.receiptErrors.length > 0) {
        parts.push(`Apple gaf terug: ${r.receiptErrors.join(', ')}.`)
      } else {
        parts.push('Apple heeft de melding aangenomen.')
      }
      if (!r.pushEnabled) {
        parts.push(
          'Let op: je hoofdschakelaar staat uit, dus gewone meldingen komen niet aan. Deze test gaat daar bewust langs.',
        )
      }
      if (r.removedTokens > 0) {
        parts.push(`${r.removedTokens} verlopen toestel(len) opgeruimd.`)
      }
      setResult(parts.join(' '))
    },
    onError: (e) => toast.error(e.message),
  })

  const pushEnabled = prefs?.pushEnabled ?? true
  const cats = prefs?.categories

  return (
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${portal.base}/settings`}
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
            MELDINGEN
          </h1>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Pushmeldingen op je telefoon en tablet · gelden voor je eigen account
          </MetaLabel>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>Voorkeuren</Kicker>
        <Tile accentBar={pushEnabled ? P.brand : P.line}>
          <Row label="Pushmeldingen" sub="Zet alle meldingen aan of uit">
            <Switch
              label="Pushmeldingen"
              checked={pushEnabled}
              disabled={isLoading || save.isPending}
              onChange={(next) => save.mutate({ pushEnabled: next })}
            />
          </Row>
        </Tile>

        {CATEGORIES.map((c) => (
          <Tile key={c.key} accentBar={P.ice}>
            <Row label={c.label} sub={c.sub}>
              <Switch
                label={c.label}
                checked={cats?.[c.key] ?? true}
                disabled={isLoading || !pushEnabled || save.isPending}
                onChange={(next) => save.mutate({ categories: { [c.key]: next } })}
              />
            </Row>
          </Tile>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>Toestellen</Kicker>
        {devices && devices.length > 0 ? (
          devices.map((d) => (
            <Tile key={d.id} accentBar={P.teal}>
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                {d.deviceName ?? d.platform}
              </p>
              <p
                className="athletic-mono"
                style={{
                  color: P.inkMuted,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  marginTop: 2,
                  textTransform: 'none',
                }}
              >
                {d.platform} · laatst gezien{' '}
                {new Date(d.lastSeenAt).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </Tile>
          ))
        ) : (
          <Tile accentBar={P.gold}>
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>Nog geen toestel</p>
            <p
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 11,
                letterSpacing: '0.04em',
                marginTop: 2,
                textTransform: 'none',
              }}
            >
              Log in de app in op dit account en geef toestemming voor meldingen.
            </p>
          </Tile>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>Testen</Kicker>
        <DarkButton
          onClick={() => {
            setResult(null)
            sendTest.mutate()
          }}
          loading={sendTest.isPending}
          disabled={sendTest.isPending}
        >
          {sendTest.isPending ? 'Versturen…' : 'Stuur testmelding'}
        </DarkButton>
        {result && (
          <Tile accentBar={P.ice}>
            <p style={{ color: P.ink, fontSize: 13, lineHeight: '19px' }}>{result}</p>
          </Tile>
        )}
        <MetaLabel style={{ textTransform: 'none', fontWeight: 500 }}>
          Komt er niets binnen terwijl hierboven staat dat het gelukt is? Check dan of meldingen
          voor BASE aanstaan in de instellingen van je toestel.
        </MetaLabel>
      </div>
    </div>
  )
}
