/**
 * Demo-lus in de lege program-builder: laat in zes seconden zien hoe je een
 * programma bouwt. Oefening uit de bibliotheek naar de dag, naam invullen,
 * Deployen wordt actief.
 *
 * Het is een TEKENING, geen echte dnd-kit-simulatie. Een drag namaken vraagt
 * synthetische pointer-events en zou breken bij elke wijziging aan de builder.
 * Dit zijn vijf vlakjes met CSS-keyframes eroverheen (`mbt-demo-*` in
 * globals.css), die daar ook uitlegt waarom het laatste frame de eindstand is.
 *
 * Wanneer hij verschijnt:
 *  - alleen zolang de quick-start-stap "programma" nog open staat
 *    (`onboarding.progress.program === false`). Zodra iemand zijn eerste echte
 *    programma heeft gebouwd is de demo voorgoed weg. Zonder die koppeling zou
 *    een therapeut hem bij élk nieuw programma weer zien, want dat begint altijd
 *    met een leeg scherm;
 *  - niet in het atleet-portaal. Dat mount dezelfde `ProgramBuilder`, maar
 *    `onboarding.progress` draait op `coachStaffProcedure` en zou daar een
 *    FORBIDDEN opleveren. Inhoudelijk klopt het ook niet: een atleet bouwt voor
 *    zichzelf en deployt niets naar een patiënt;
 *  - niet als hij is weggeklikt (localStorage).
 */
'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { P } from '@/lib/palette'
import { trpc } from '@/lib/trpc/client'

const HIDDEN_KEY = 'mbt-builder-demo-hidden'

export function BuilderDemo() {
  const pathname = usePathname()
  const isAthlete = pathname?.startsWith('/athlete') ?? false
  const [hidden, setHidden] = useState(true)

  const { data: progress } = trpc.onboarding.progress.useQuery(undefined, {
    enabled: !isAthlete,
  })

  useEffect(() => {
    let stored = true
    try {
      stored = window.localStorage.getItem(HIDDEN_KEY) !== null
    } catch {
      stored = false // localStorage uit: gewoon tonen, dit is geen geheim
    }
    // Cascading render is hier de bedoeling: dit hangt van localStorage af, en
    // dat kunnen we alleen client-side lezen. Zelfde afweging als BetaDisclaimer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(stored)
  }, [])

  if (isAthlete || hidden || !progress || progress.program) return null

  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ background: '#15363A', border: '1px solid rgba(212,232,230,0.10)' }}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-2.5">
        <span
          className="athletic-mono"
          style={{ color: P.brand, fontSize: 10, letterSpacing: '0.16em', fontWeight: 900 }}
        >
          ZO BOUW JE EEN PROGRAMMA
        </span>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(HIDDEN_KEY, new Date().toISOString())
            } catch {}
            setHidden(true)
          }}
          className="athletic-mono athletic-tap"
          style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.12em' }}
        >
          VERBERGEN
        </button>
      </div>

      {/* De tekening. aria-hidden: de regel eronder zegt hetzelfde in woorden,
          en een screenreader heeft niets aan losse gestileerde vlakjes. */}
      <div aria-hidden className="px-3 py-3">
        {/* Naamveld + deploy-knop */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex-1 min-w-0 flex items-center gap-1 rounded px-2 h-6"
            style={{ background: '#1C4448', border: '1px solid rgba(212,232,230,0.10)' }}
          >
            <span
              className="mbt-demo-type overflow-hidden whitespace-nowrap"
              style={{ color: P.ink, fontSize: 11, fontWeight: 700 }}
            >
              Knie revalidatie week 1
            </span>
            <span
              className="mbt-demo-caret"
              style={{ width: 1, height: 11, background: P.brand, display: 'inline-block' }}
            />
          </div>
          <div
            className="mbt-demo-deploy shrink-0 rounded px-2 h-6 flex items-center athletic-mono"
            style={{ fontSize: 9, letterSpacing: '0.1em', fontWeight: 900 }}
          >
            DEPLOYEN
          </div>
        </div>

        {/* Bibliotheek links, dag rechts */}
        <div className="flex items-stretch gap-2" style={{ minHeight: 74 }}>
          <div className="w-[42%] shrink-0 relative">
            <span
              className="athletic-mono block mb-1"
              style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.12em' }}
            >
              BIBLIOTHEEK
            </span>
            <DemoPill name="Squat" />
            <div className="mt-1">
              <DemoPill name="Lunge" muted />
            </div>

            {/* Het reizende kaartje. De verplaatsing staat als CSS-variabelen op
                dit element zodat de keyframes generiek blijven. */}
            <div
              className="mbt-demo-ghost absolute pointer-events-none"
              style={
                {
                  top: 16,
                  left: 0,
                  right: 0,
                  '--demo-dx': '112%',
                  '--demo-dy': '22px',
                } as React.CSSProperties
              }
            >
              <DemoPill name="Squat" lifted />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <span
              className="athletic-mono block mb-1"
              style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.12em' }}
            >
              DAG 1
            </span>
            <div
              className="mbt-demo-dropzone rounded-lg p-1.5"
              style={{ border: '1px dashed rgba(212,232,230,0.16)', minHeight: 48 }}
            >
              <div className="mbt-demo-placed">
                <DemoPill name="Squat" />
                <span
                  className="block mt-1 px-1"
                  style={{ color: P.inkDim, fontSize: 9 }}
                >
                  3 × 10
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p
        className="px-3 pb-2.5"
        style={{ color: P.inkMuted, fontSize: 11, lineHeight: '16px' }}
      >
        Sleep een oefening uit de bibliotheek naar een dag, of klik op de plus. Geef het
        programma een naam, want zonder naam blijft Deployen uit. Met Deployen koppel je het
        aan een patiënt en wordt het zichtbaar in de app.
      </p>
    </div>
  )
}

function DemoPill({ name, muted, lifted }: { name: string; muted?: boolean; lifted?: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded px-1.5 h-6"
      style={{
        background: lifted ? '#1C4448' : '#123033',
        border: `1px solid ${lifted ? 'rgba(232,122,85,0.45)' : 'rgba(212,232,230,0.10)'}`,
        boxShadow: lifted ? '0 6px 14px rgba(0,0,0,0.35)' : undefined,
        opacity: muted ? 0.45 : 1,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: P.brand }} />
      <span style={{ color: P.ink, fontSize: 10, fontWeight: 700 }}>{name}</span>
    </div>
  )
}
