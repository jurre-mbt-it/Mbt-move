/**
 * "Start behandeling" op het therapeut-dashboard: kies een patiënt en ga
 * rechtstreeks naar het behandelscherm.
 *
 * Gespiegeld van het home-scherm van de iOS-app (`app/(tabs)/index.tsx`,
 * `heroNode` + de patiënt-kiezer): zelfde plek in de volgorde, zelfde lime
 * hero, zelfde zoek-en-kies. Voorheen moest je op het web eerst naar de
 * patiëntenlijst, dan het profiel, dan de knop bovenin.
 *
 * NIET voor coaches. Behandeling loggen is een klinische schrijf-actie en
 * draait op `therapistProcedure`, niet op `coachStaffProcedure`. Het dashboard
 * wordt gedeeld met de coach-shell, dus de kaart gaat daar bewust uit.
 * Zie AGENTS.md.
 *
 * Kom je hier via stap 5 van de quick start (`?start=behandeling`), dan gloeit
 * de knop drie keer op zodat je hem tussen de rest van het dashboard vindt.
 */
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkDialogDescription as DialogDescription,
  DarkInput,
  P,
} from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'
import { trpc } from '@/lib/trpc/client'

/** Query-param waarmee de quick start naar deze knop wijst. */
export const START_TREATMENT_PARAM = 'start'
export const START_TREATMENT_VALUE = 'behandeling'

export function StartTreatmentCard() {
  const portal = usePortal()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [zoek, setZoek] = useState('')

  // Al opgehaald door het dashboard zelf, dus dit kost geen extra request.
  const { data: patients = [] } = trpc.patients.list.useQuery(undefined, {
    enabled: !portal.isCoach,
  })

  const gevonden = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    return patients
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [patients, zoek])

  if (portal.isCoach) return null

  const highlight = searchParams.get(START_TREATMENT_PARAM) === START_TREATMENT_VALUE

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setZoek('')
          setOpen(true)
        }}
        className={`athletic-tap mbt-btn-hover w-full flex items-center justify-between gap-3 rounded-2xl text-left${
          highlight ? ' mbt-attention' : ''
        }`}
        style={{ backgroundColor: P.lime, padding: '18px 18px' }}
      >
        <span className="min-w-0">
          <span
            className="block"
            style={{ color: P.bg, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}
          >
            Start behandeling
          </span>
          <span style={{ color: 'rgba(14,39,41,0.72)', fontSize: 12.5, marginTop: 2, display: 'block' }}>
            Kies een patiënt en log live mee
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, background: 'rgba(14,39,41,0.14)', color: P.bg, fontSize: 16 }}
        >
          →
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start behandeling</DialogTitle>
            <DialogDescription>
              Kies de patiënt die voor je staat. Je komt direct in het behandelscherm.
            </DialogDescription>
          </DialogHeader>

          <DarkInput
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek patiënt…"
            autoFocus
            autoComplete="off"
          />

          <div className="mt-3 flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto">
            {gevonden.length === 0 ? (
              <p style={{ color: P.inkMuted, fontSize: 13, padding: '12px 2px' }}>
                {patients.length === 0
                  ? 'Je hebt nog geen patiënten. Nodig er eerst een uit.'
                  : 'Geen patiënt gevonden met die naam.'}
              </p>
            ) : (
              gevonden.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    router.push(`${portal.base}/treatment/${p.id}`)
                  }}
                  className="athletic-tap mbt-card-hover w-full flex items-center justify-between gap-3 rounded-xl text-left"
                  style={{ backgroundColor: P.surface, padding: '12px 14px' }}
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate"
                      style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}
                    >
                      {p.name}
                    </span>
                    {p.programName && (
                      <span
                        className="block truncate"
                        style={{ color: P.inkMuted, fontSize: 12, marginTop: 1 }}
                      >
                        {p.programName}
                      </span>
                    )}
                  </span>
                  <span
                    className="athletic-mono shrink-0"
                    style={{ color: P.lime, fontSize: 11, letterSpacing: '0.14em', fontWeight: 900 }}
                  >
                    START →
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
