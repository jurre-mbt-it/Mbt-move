'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui/switch'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogFooter as DialogFooter,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkHeader,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function PrivacySettingsPage() {
  const router = useRouter()
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.research.getConsentStatus.useQuery()

  const setConsent = trpc.research.setConsent.useMutation({
    onSuccess: (result) => {
      utils.research.getConsentStatus.invalidate()
      if (result.consentGiven) {
        toast.success('Toestemming gegeven. Bedankt voor je bijdrage!')
      } else {
        toast.success('Toestemming ingetrokken. Je data is verwijderd.')
      }
    },
    onError: () => toast.error('Er is iets misgegaan. Probeer opnieuw.'),
  })

  function handleToggle(checked: boolean) {
    if (!checked) {
      setShowWithdrawDialog(true)
    } else {
      setConsent.mutate({ consentGiven: true })
    }
  }

  function confirmWithdraw() {
    setShowWithdrawDialog(false)
    setConsent.mutate({ consentGiven: false })
  }

  const consentGiven = data?.consentGiven ?? false
  const consentDate = data?.consentGivenAt
    ? new Date(data.consentGivenAt).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <DarkScreen>
      <DarkHeader title="Privacy" onBack={() => router.back()} />

      <div className="max-w-lg w-full mx-auto px-4 pt-4 pb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Privacy &amp; onderzoek</Kicker>
          <Display size="md">GEGEVENS</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Beheer je gegevensdeling
          </MetaLabel>
        </div>

        {/* Consent toggle card */}
        <Tile accentBar={consentGiven ? P.lime : P.inkDim}>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p
                className="athletic-mono"
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                GEANONIMISEERDE DATA DELEN
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4, lineHeight: '17px' }}>
                Sta Movement Based Therapy toe om je trainingsdata anoniem te gebruiken voor
                onderzoek.
              </p>
              {!isLoading && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {consentGiven ? (
                    <>
                      <span
                        className="athletic-mono px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: P.surfaceHi,
                          color: P.lime,
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: '0.08em',
                          border: `1px solid ${P.lime}`,
                        }}
                      >
                        TOESTEMMING GEGEVEN
                      </span>
                      {consentDate && (
                        <span style={{ color: P.inkMuted, fontSize: 11 }}>op {consentDate}</span>
                      )}
                    </>
                  ) : (
                    <span
                      className="athletic-mono px-2 py-1 rounded-full"
                      style={{
                        backgroundColor: P.surfaceHi,
                        color: P.inkMuted,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        border: `1px solid ${P.lineStrong}`,
                      }}
                    >
                      GEEN TOESTEMMING
                    </span>
                  )}
                </div>
              )}
            </div>
            <Switch
              checked={consentGiven}
              onCheckedChange={handleToggle}
              disabled={isLoading || setConsent.isPending}
            />
          </div>
        </Tile>

        {/* What's collected */}
        <Tile>
          <div className="flex flex-col gap-3">
            <MetaLabel>Wat wordt er verzameld?</MetaLabel>
            <div className="flex flex-col gap-2">
              {[
                { text: 'Trainingsgegevens (oefeningen, sets, herhalingen)', included: true },
                { text: 'Demografisch (leeftijd, diagnose categorie)', included: true },
                { text: 'Sessie-informatie (duur, pijnniveau, RPE)', included: true },
                { text: 'Je naam of e-mailadres', included: false },
                { text: 'Contactgegevens of persoonlijke informatie', included: false },
                { text: 'Identificeerbare gegevens', included: false },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="athletic-mono w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0"
                    style={{
                      backgroundColor: item.included ? P.lime : P.surfaceHi,
                      color: item.included ? P.bg : P.danger,
                      fontSize: 10,
                      fontWeight: 900,
                      border: item.included ? 'none' : `1px solid ${P.danger}`,
                    }}
                  >
                    {item.included ? '✓' : '✕'}
                  </span>
                  <span
                    style={{
                      color: item.included ? P.ink : P.inkDim,
                      fontSize: 13,
                      textDecoration: item.included ? 'none' : 'line-through',
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Tile>

        {/* GDPR info */}
        <Tile>
          <div className="flex flex-col gap-3">
            <MetaLabel>Je rechten (AVG/GDPR)</MetaLabel>
            <div className="flex flex-col gap-2">
              {[
                'Je kunt toestemming op elk moment intrekken',
                'Bij intrekken worden ALLE anonieme records direct verwijderd',
                'De koppeling tussen jou en je anonieme ID wordt ook gewist',
                'Data is nooit herleidbaar naar jou als persoon',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: P.lime }}
                  />
                  <span style={{ color: P.inkMuted, fontSize: 13 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Tile>

        {/* DPA link */}
        <Tile href="/patient/legal/dpa" accentBar={P.ice}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p
                className="athletic-mono"
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                VERWERKINGSOVEREENKOMST
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                Bekijk hoe wij uw persoonsgegevens verwerken (AVG)
              </p>
            </div>
            <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
              →
            </span>
          </div>
        </Tile>

        {/* Withdraw button (only shown when consent is given) */}
        {consentGiven && (
          <DarkButton
            variant="danger"
            onClick={() => setShowWithdrawDialog(true)}
            disabled={setConsent.isPending}
          >
            TOESTEMMING INTREKKEN
          </DarkButton>
        )}
      </div>

      {/* Confirm withdraw dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent
          className="athletic-dark"
          style={{
            borderRadius: 16,
            backgroundColor: P.surface,
            color: P.ink,
            border: `1px solid ${P.lineStrong}`,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>Toestemming intrekken?</DialogTitle>
            <DialogDescription style={{ color: P.inkMuted }}>
              Al je geanonimiseerde trainingsdata wordt direct en permanent verwijderd. Dit kan niet
              ongedaan worden gemaakt. Je trainingen en voortgang in de app blijven gewoon
              beschikbaar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DarkButton variant="secondary" onClick={() => setShowWithdrawDialog(false)}>
              ANNULEREN
            </DarkButton>
            <DarkButton variant="danger" onClick={confirmWithdraw}>
              JA, VERWIJDER
            </DarkButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DarkScreen>
  )
}
