/**
 * Welkomstmodal voor een therapeut die nog niets heeft gedaan.
 *
 * Let op het verschil met `WhatsNewModal`: die toont bij een eerste bezoek
 * bewust niets en zet stil een baseline. Deze moet juist alleen dán komen.
 *
 * Toonvoorwaarden, alle vier:
 *  - `onboarding.progress` is geladen en staat op nul van de vijf;
 *  - de gebruiker heeft hem niet eerder weggeklikt;
 *  - de beta-disclaimer is akkoord (dat is een blocking dialog, daar mogen we
 *    niet overheen komen);
 *  - localStorage werkt. Geblokkeerd betekent dat we niet kunnen onthouden dat
 *    hij is weggeklikt, en dan is elke paginalading opnieuw zeuren erger dan
 *    hem overslaan. De pagina blijft via de zijbalk bereikbaar.
 */
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DarkButton, Kicker, P, CARD } from '@/components/dark-ui'
import { QUICK_START_DISMISSED_KEY, quickStartIntro, quickStartSteps } from '@/lib/quick-start'
import { trpc } from '@/lib/trpc/client'
import { ACCEPTANCE_KEY, BETA_ACCEPTED_EVENT } from './BetaDisclaimer'

export function QuickStartModal() {
  const router = useRouter()
  const { data: progress } = trpc.onboarding.progress.useQuery()
  // null zolang we localStorage nog niet hebben gelezen: dan tonen we niets.
  const [gate, setGate] = useState<{ dismissed: boolean; betaAccepted: boolean } | null>(null)

  useEffect(() => {
    let next: { dismissed: boolean; betaAccepted: boolean }
    try {
      next = {
        dismissed: window.localStorage.getItem(QUICK_START_DISMISSED_KEY) !== null,
        betaAccepted: window.localStorage.getItem(ACCEPTANCE_KEY) !== null,
      }
    } catch {
      next = { dismissed: true, betaAccepted: false }
    }
    // Cascading render is hier de bedoeling: de gate hangt af van localStorage
    // (extern) die we alleen client-side kunnen lezen. Zelfde afweging als in
    // BetaDisclaimer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGate(next)

    const onBetaAccepted = () => setGate((g) => (g ? { ...g, betaAccepted: true } : g))
    window.addEventListener(BETA_ACCEPTED_EVENT, onBetaAccepted)
    return () => window.removeEventListener(BETA_ACCEPTED_EVENT, onBetaAccepted)
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(QUICK_START_DISMISSED_KEY, new Date().toISOString())
    } catch {}
    setGate((g) => (g ? { ...g, dismissed: true } : g))
  }

  // Pas beslissen als `progress` er is, anders flitst de modal even bij een
  // therapeut die allang bezig is.
  const nothingDone = progress ? quickStartSteps.every((s) => !progress[s.id]) : false
  if (!gate || gate.dismissed || !gate.betaAccepted || !nothingDone) return null

  return (
    <div
      className="mbt-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Welkom bij BASE"
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
        style={{...CARD }}
        onClick={(e) => e.stopPropagation()}
      >
        <Kicker>Quick start</Kicker>
        <h2
          className="athletic-display mt-1"
          style={{ color: P.ink, fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em' }}
        >
          WELKOM BIJ BASE
        </h2>
        <p style={{ color: P.ink, fontSize: 14, marginTop: 12, lineHeight: '20px' }}>
          {quickStartIntro.welcome}
        </p>

        <ol className="mt-4 space-y-2">
          {quickStartSteps.map((step, i) => (
            <li
              key={step.id}
              className="flex items-start gap-2.5"
              style={{ color: P.inkMuted, fontSize: 13, lineHeight: '20px' }}
            >
              <span
                aria-hidden
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  marginTop: 1,
                  backgroundColor: P.surfaceHi,
                  color: P.inkMuted,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span>{step.title}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="athletic-mono athletic-tap"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
          >
            LATER
          </button>
          <DarkButton
            onClick={() => {
              dismiss()
              router.push('/therapist/quick-start')
            }}
          >
            NEEM ME MEE
          </DarkButton>
        </div>
      </div>
    </div>
  )
}
