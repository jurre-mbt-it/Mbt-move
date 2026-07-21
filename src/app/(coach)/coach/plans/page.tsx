'use client'

/**
 * Trainingsplannen van de coach.
 *
 * Een plan is een meerweeks weekschema-sjabloon (WeekPlanTemplate). Je bouwt
 * het in de weekplanner en slaat het daar op als plan; hier staat je
 * bibliotheek en zet je een plan op de kalender van een of meer atleten.
 *
 * Toepassen is een KOPIE: het plan later aanpassen raakt lopende atleten niet.
 * Zie docs/plan-coach-role-20260721.md.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
  SkeletonList,
  Tile,
} from '@/components/dark-ui'

/** Maandag van de week waarin `d` valt, als YYYY-MM-DD. */
function mondayIso(d = new Date()): string {
  const x = new Date(d)
  const shift = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - shift)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function CoachPlansPage() {
  const portal = usePortal()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [applyFor, setApplyFor] = useState<{ id: string; name: string; weeks: number } | null>(null)

  const { data: plans, isLoading } = trpc.planTemplates.list.useQuery()

  const filtered = useMemo(() => {
    const list = plans ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (t) => t.name.toLowerCase().includes(needle) || (t.goal ?? '').toLowerCase().includes(needle),
    )
  }, [plans, q])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>Trainingsplannen</Kicker>
          <Display>Je plannen</Display>
          <MetaLabel>
            Meerweekse schema&rsquo;s die je op de kalender van een atleet zet
          </MetaLabel>
        </div>
        <DarkButton variant="primary" href={`${portal.base}/week-planner`}>
          Plan bouwen in de weekplanner
        </DarkButton>
      </div>

      <DarkInput
        placeholder="Zoek op naam of doel"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <Tile>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.6 }}>
            {plans?.length
              ? 'Geen plan gevonden met die zoekterm.'
              : 'Je hebt nog geen plannen. Bouw een paar weken in de weekplanner en sla ze daar op als plan. Daarna zet je ze hier in één keer op de kalender van een atleet.'}
          </p>
        </Tile>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Tile key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p style={{ color: P.ink, fontWeight: 800, fontSize: 15 }}>{t.name}</p>
                  {t.goal ? <MetaLabel>{t.goal}</MetaLabel> : null}
                </div>
                {t.isGlobalSeed && (
                  <span
                    className="athletic-mono shrink-0 rounded px-2 py-1"
                    style={{ background: 'rgba(255,255,255,0.06)', color: P.inkMuted, fontSize: 10 }}
                  >
                    VOORBEELD
                  </span>
                )}
              </div>

              <p className="athletic-mono mt-3" style={{ color: P.inkDim, fontSize: 11 }}>
                {t.weeks} {t.weeks === 1 ? 'week' : 'weken'} · {t.sessionCount}{' '}
                {t.sessionCount === 1 ? 'item' : 'items'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <DarkButton
                  variant="primary"
                  size="sm"
                  onClick={() => setApplyFor({ id: t.id, name: t.name, weeks: t.weeks })}
                >
                  Naar atleet sturen
                </DarkButton>
                <DarkButton
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`${portal.base}/week-planner`)}
                >
                  Bekijken
                </DarkButton>
              </div>
            </Tile>
          ))}
        </div>
      )}

      {applyFor && (
        <ApplyToAthletesDialog plan={applyFor} onClose={() => setApplyFor(null)} />
      )}
    </div>
  )
}

/**
 * Eén plan naar een of meer atleten. Bulk is bewust een gewone lus over
 * dezelfde mutatie: de server doet per atleet exact wat de weekplanner ook
 * doet, dus er is geen tweede code-pad dat uit de pas kan lopen.
 */
function ApplyToAthletesDialog({
  plan,
  onClose,
}: {
  plan: { id: string; name: string; weeks: number }
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [startDate, setStartDate] = useState(() => mondayIso())
  const [busy, setBusy] = useState(false)

  const { data: athletes, isLoading } = trpc.patients.list.useQuery()
  const utils = trpc.useUtils()
  const apply = trpc.planTemplates.applyToPatient.useMutation()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function send() {
    if (selected.size === 0) return
    setBusy(true)
    const ids = [...selected]
    const failed: string[] = []
    for (const patientId of ids) {
      try {
        await apply.mutateAsync({ templateId: plan.id, patientId, anchorDate: startDate, anchor: 'start', mode: 'merge' })
      } catch {
        failed.push(patientId)
      }
    }
    setBusy(false)
    const ok = ids.length - failed.length
    if (ok > 0) {
      toast.success(`${plan.name} geplaatst`, {
        description: `${ok} ${ok === 1 ? 'atleet' : 'atleten'} vanaf ${startDate}`,
      })
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} niet gelukt`, {
        description: 'Controleer of je nog gekoppeld bent aan deze atleten.',
      })
    }
    utils.patients.list.invalidate()
    if (failed.length === 0) onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan.name} versturen</DialogTitle>
          <DialogDescription>
            Het plan van {plan.weeks} {plan.weeks === 1 ? 'week' : 'weken'} wordt als kopie op de
            kalender gezet. Pas je het plan later aan, dan verandert er niets bij deze atleten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <MetaLabel>Startweek (maandag)</MetaLabel>
            <DarkInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(mondayIso(new Date(e.target.value)))}
            />
          </div>

          <div>
            <MetaLabel>Atleten</MetaLabel>
            {isLoading ? (
              <SkeletonList count={3} />
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {(athletes ?? []).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="athletic-tap flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left"
                    style={{
                      background: selected.has(a.id) ? P.surfaceHi : 'transparent',
                      color: selected.has(a.id) ? P.ink : P.inkMuted,
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded"
                      style={{
                        border: `1.5px solid ${selected.has(a.id) ? P.brand : P.lineStrong}`,
                        background: selected.has(a.id) ? P.brand : 'transparent',
                      }}
                    />
                    <span className="truncate text-sm">{a.name ?? a.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <DarkButton variant="secondary" onClick={onClose} disabled={busy}>
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              onClick={send}
              disabled={busy || selected.size === 0}
              loading={busy}
            >
              {selected.size > 1 ? `Naar ${selected.size} atleten` : 'Versturen'}
            </DarkButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
