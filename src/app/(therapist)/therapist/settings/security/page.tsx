'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  Kicker,
  MetaLabel,
  P,
  PulsingDot,
  Tile,
} from '@/components/dark-ui'

export default function SecuritySettingsPage() {
  const { data: mfa, refetch } = trpc.auth.mfaStatus.useQuery()
  const generateMutation = trpc.auth.generateBackupCodes.useMutation()
  const [shownCodes, setShownCodes] = useState<string[] | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)

  async function handleGenerate() {
    try {
      const res = await generateMutation.mutateAsync()
      setShownCodes(res.codes)
      setConfirmRegen(false)
      await refetch()
      toast.success(`${res.count} backup-codes aangemaakt`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon geen codes aanmaken.')
    }
  }

  function copyAll() {
    if (!shownCodes) return
    const txt = shownCodes.join('\n')
    navigator.clipboard.writeText(txt)
    toast.success('Codes gekopieerd — plak in je password-manager')
  }

  function printCodes() {
    if (!shownCodes) return
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) {
      toast.error('Popup geblokkeerd. Kopieer handmatig.')
      return
    }
    win.document.write(`
      <html><head><title>MBT-Move MFA backup-codes</title>
      <style>
        body { font-family: 'SF Mono', Menlo, monospace; padding: 24px; }
        h1 { font-size: 14px; letter-spacing: 0.2em; }
        code { font-size: 18px; display: block; padding: 4px 0; letter-spacing: 0.1em; }
        .notice { font-family: system-ui; font-size: 11px; color: #666; margin-top: 24px; }
      </style>
      </head><body>
      <h1>MBT·MOVE MFA BACKUP-CODES</h1>
      <p>${new Date().toLocaleDateString('nl-NL')}</p>
      ${shownCodes.map((c) => `<code>${c}</code>`).join('')}
      <div class="notice">
        Elke code is één keer bruikbaar. Bewaar op een veilige plek — bijvoorbeeld in een brandkast
        of password-manager. Als je je authenticator-app kwijtraakt, kun je hiermee inloggen.
      </div>
      </body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 200)
  }

  return (
    <div className="max-w-lg w-full flex flex-col gap-4 pb-12">
      <div className="flex flex-col gap-1">
        <Kicker>Account</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          BEVEILIGING
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Two-factor authenticator + backup-codes
        </MetaLabel>
      </div>

      {/* MFA status */}
      <Tile accentBar={mfa?.enabled ? P.lime : mfa?.required ? P.danger : P.gold}>
        <div className="flex items-center gap-2">
          {mfa?.enabled && <PulsingDot color={P.lime} />}
          <Kicker style={{ color: mfa?.enabled ? P.lime : mfa?.required ? P.danger : P.gold }}>
            {mfa?.enabled
              ? 'MFA · ACTIEF'
              : mfa?.required
                ? 'MFA · VERPLICHT VOOR JOUW ROL'
                : 'MFA · OPTIONEEL'}
          </Kicker>
        </div>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          {mfa?.enabled ? (
            <>
              Je account is beveiligd met Two-Factor Authentication via een Authenticator-app.
              Bij elke login wordt een 6-cijfer code gevraagd.
            </>
          ) : mfa?.required ? (
            <>
              Als therapeut/admin ben je verplicht om MFA aan te zetten. Dit beschermt de
              patiënt-dossiers tegen toegang via een gestolen wachtwoord.
            </>
          ) : (
            <>
              Je kunt je account extra beveiligen met een Authenticator-app (bijv. Google
              Authenticator, 1Password, Authy).
            </>
          )}
        </p>
        {!mfa?.enabled && (
          <div className="mt-4">
            <DarkButton variant="primary" href="/mfa/enroll">
              {mfa?.required ? 'Nu MFA inschakelen' : 'MFA inschakelen'}
            </DarkButton>
          </div>
        )}
      </Tile>

      {/* Backup codes */}
      {mfa?.enabled && (
        <Tile accentBar={P.gold}>
          <Kicker style={{ color: P.gold }}>BACKUP-CODES</Kicker>
          <p
            style={{
              color: P.inkMuted,
              fontSize: 13,
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            Gebruik deze codes om in te loggen als je je authenticator-app kwijtraakt. Elke code
            werkt één keer. Bewaar ze op een veilige plek (brandkast, password-manager, print).
          </p>
          <div className="flex items-center gap-3 mt-3">
            <span
              className="athletic-mono"
              style={{
                color: (mfa.backupCodesRemaining ?? 0) < 3 ? P.danger : P.ink,
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              {mfa.backupCodesRemaining ?? 0}
            </span>
            <div>
              <MetaLabel>RESTEREND</MetaLabel>
              {mfa.lastBackupCodesGeneratedAt && (
                <p style={{ color: P.inkDim, fontSize: 11, marginTop: 2 }}>
                  Laatst gegenereerd:{' '}
                  {new Date(mfa.lastBackupCodesGeneratedAt).toLocaleDateString('nl-NL')}
                </p>
              )}
            </div>
          </div>

          {!shownCodes && !confirmRegen && (
            <div className="mt-4">
              {(mfa.backupCodesRemaining ?? 0) === 0 ? (
                <DarkButton
                  variant="primary"
                  onClick={handleGenerate}
                  loading={generateMutation.isPending}
                >
                  Backup-codes aanmaken
                </DarkButton>
              ) : (
                <DarkButton
                  variant="secondary"
                  onClick={() => setConfirmRegen(true)}
                >
                  Codes opnieuw genereren
                </DarkButton>
              )}
            </div>
          )}

          {confirmRegen && !shownCodes && (
            <div
              className="mt-4 rounded-lg p-3 space-y-3"
              style={{ border: `1px solid ${P.danger}`, background: 'rgba(248,113,113,0.08)' }}
            >
              <p style={{ color: P.danger, fontSize: 13, lineHeight: 1.5 }}>
                Dit maakt je huidige backup-codes ongeldig. Zeker weten?
              </p>
              <div className="flex gap-2">
                <DarkButton
                  variant="ghost"
                  onClick={() => setConfirmRegen(false)}
                  className="flex-1"
                >
                  Annuleer
                </DarkButton>
                <DarkButton
                  variant="danger"
                  onClick={handleGenerate}
                  loading={generateMutation.isPending}
                  className="flex-1"
                >
                  Ja, regenereer
                </DarkButton>
              </div>
            </div>
          )}

          {shownCodes && (
            <div
              className="mt-4 rounded-lg p-3 space-y-3"
              style={{ border: `1px solid ${P.lime}`, background: 'rgba(190,242,100,0.08)' }}
            >
              <MetaLabel style={{ color: P.lime }}>
                NIEUW · WORDT NIET OPNIEUW GETOOND
              </MetaLabel>
              <div className="grid grid-cols-2 gap-2">
                {shownCodes.map((c) => (
                  <code
                    key={c}
                    className="athletic-mono text-center rounded-md py-2"
                    style={{
                      background: P.surfaceLow,
                      color: P.ink,
                      fontSize: 13,
                      letterSpacing: '0.1em',
                      fontWeight: 900,
                      border: `1px solid ${P.line}`,
                    }}
                  >
                    {c}
                  </code>
                ))}
              </div>
              <div className="flex gap-2">
                <DarkButton variant="secondary" className="flex-1" onClick={copyAll}>
                  Kopieer alles
                </DarkButton>
                <DarkButton variant="secondary" className="flex-1" onClick={printCodes}>
                  Print
                </DarkButton>
              </div>
              <DarkButton
                variant="primary"
                className="w-full"
                onClick={() => setShownCodes(null)}
              >
                Ik heb ze veilig opgeslagen
              </DarkButton>
            </div>
          )}
        </Tile>
      )}
    </div>
  )
}
