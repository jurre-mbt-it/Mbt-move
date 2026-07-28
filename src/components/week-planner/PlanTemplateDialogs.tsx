'use client'

/**
 * Plan-sjablonen in de week-planner.
 *
 *   ApplyPlanDialog  — kies een meerweeks plan uit de bibliotheek en zet het
 *                      vanaf een datum op de kalender van een patiënt.
 *   SavePlanDialog   — sla het geselecteerde weekbereik op als herbruikbaar plan.
 *   DeletePlanDialog — gooi een plan uit de bibliotheek weg.
 *
 * Toepassen is een KOPIE (stempel): het plan later wijzigen raakt lopende
 * patiënten niet. Zie `planTemplates.applyToPatient`.
 */

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { CalendarRange, Flag, Globe, Search } from 'lucide-react'
import { PHASE_META, type PhaseType } from '@/lib/periodization'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkTextarea,
  MetaLabel,
  P,
} from '@/components/dark-ui'

const DAY_LABELS = ['M', 'D', 'W', 'D', 'V', 'Z', 'Z']

// ── Datum-helpers ─────────────────────────────────────────────────────────
// Lokale datumsleutel, géén toISOString(): die rekent naar UTC en schuift een
// lokale middernacht in CEST een dag terug.
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIsoDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
function mondayOf(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
function fmtShort(d: Date): string {
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]}`
}

/** Zie planTemplates.planStartMonday — client-side spiegel voor de preview. */
function planStartMonday(anchorIso: string, anchor: 'start' | 'event', weeks: number): Date {
  const m = mondayOf(parseIsoDay(anchorIso))
  return anchor === 'start' ? m : addDays(m, -(weeks - 1) * 7)
}

// ══ Plan toepassen ════════════════════════════════════════════════════════
export function ApplyPlanDialog({
  patientId, patientLabel, defaultDate, onClose, onApplied,
}: {
  patientId: string
  patientLabel: string
  /** ISO-dag waarop de planner staat (bijv. de zichtbare maand). */
  defaultDate: string
  onClose: () => void
  onApplied: () => void
}) {
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<'start' | 'event'>('start')
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [anchorDate, setAnchorDate] = useState(() => isoDay(mondayOf(parseIsoDay(defaultDate))))
  const [q, setQ] = useState('')

  const { data: templates, isLoading } = trpc.planTemplates.list.useQuery()

  const apply = trpc.planTemplates.applyToPatient.useMutation({
    onSuccess: (r) => {
      const parts = [`${r.placedItems} ${r.placedItems === 1 ? 'item' : 'items'}`]
      if (r.createdWeeks) parts.push(`${r.createdWeeks} ${r.createdWeeks === 1 ? 'nieuwe week' : 'nieuwe weken'}`)
      if (r.replacedWeeks) parts.push(`${r.replacedWeeks} vervangen`)
      toast.success(`${r.planName} geplaatst`, { description: `${parts.join(' · ')} vanaf ${r.startDate}` })
      onApplied()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const filtered = useMemo(() => {
    const list = templates ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(t =>
      t.name.toLowerCase().includes(needle) ||
      (t.goal ?? '').toLowerCase().includes(needle),
    )
  }, [templates, q])

  const selected = useMemo(
    () => (templates ?? []).find(t => t.id === templateId) ?? null,
    [templates, templateId],
  )

  const range = useMemo(() => {
    if (!selected) return null
    const start = planStartMonday(anchorDate, anchor, selected.weeks)
    const end = addDays(start, (selected.weeks - 1) * 7 + 6)
    return { start, end }
  }, [selected, anchorDate, anchor])

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Plan toepassen</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] -mt-2 mb-3" style={{ color: P.inkDim }}>
          Kies een plan uit de bibliotheek en een datum. Het plan wordt gekopieerd naar {patientLabel}; latere
          wijzigingen aan het plan raken deze patiënt niet.
        </p>

        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* Bibliotheek */}
          <div className="min-w-0">
            <MetaLabel>Bibliotheek</MetaLabel>
            <div className="relative mt-1.5 mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: P.inkDim }} />
              <DarkInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoek op naam of doel…"
                className="pl-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-0.5">
              {isLoading && (
                <p className="text-xs py-4 text-center" style={{ color: P.inkDim }}>Laden…</p>
              )}
              {!isLoading && filtered.length === 0 && (
                <p className="text-xs py-4 text-center leading-relaxed" style={{ color: P.inkDim }}>
                  Nog geen plannen. Selecteer weken in de kalender en kies &quot;Opslaan als plan&quot;.
                </p>
              )}
              {filtered.map(t => {
                const active = t.id === templateId
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className="text-left rounded-lg p-2.5 transition-colors"
                    style={{
                      background: active ? `color-mix(in srgb, ${P.lime} 6%, transparent)` : P.surfaceLow,
                      border: `1px solid ${active ? P.lime : P.line}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate" style={{ color: P.ink }}>{t.name}</span>
                      {t.isGlobalSeed && (
                        <Globe className="w-3 h-3 shrink-0" style={{ color: P.inkDim }} aria-label="Globaal sjabloon" />
                      )}
                    </div>
                    {t.goal && (
                      <p className="text-[11px] mt-0.5 line-clamp-2 leading-snug" style={{ color: P.inkDim }}>{t.goal}</p>
                    )}
                    <p className="text-[10px] mt-1.5 font-mono" style={{ color: P.inkMuted }}>
                      {t.weeks} {t.weeks === 1 ? 'week' : 'weken'} · {t.sessionCount} sessies
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview + instellingen */}
          <div className="min-w-0">
            <MetaLabel>Voorbeeld</MetaLabel>
            <div
              className="rounded-lg p-3 mt-1.5"
              style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
            >
              {!selected ? (
                <p className="text-xs py-6 text-center" style={{ color: P.inkDim }}>
                  Kies links een plan.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selected.weekPreview.map((w, i) => {
                    const meta = w.isDeload
                      ? PHASE_META.DELOAD
                      : (w.phaseType ? PHASE_META[w.phaseType as PhaseType] : null)
                    const ws = range ? addDays(range.start, i * 7) : null
                    return (
                      <div
                        key={w.weekNumber}
                        className="flex items-center gap-2 py-1"
                        style={{ borderBottom: i < selected.weekPreview.length - 1 ? `1px solid ${P.line}` : 'none' }}
                      >
                        <span className="font-mono text-[10px] w-6 shrink-0" style={{ color: P.inkMuted }}>
                          W{w.weekNumber}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                          style={{
                            color: meta?.color ?? P.inkDim,
                            border: `1px solid ${meta?.color ?? P.line}`,
                          }}
                        >
                          {meta?.short ?? 'geen fase'}
                        </span>
                        <span className="flex gap-0.5 flex-1">
                          {Array.from({ length: 7 }, (_, d) => (
                            <span
                              key={d}
                              title={DAY_LABELS[d]}
                              className="w-3.5 h-3.5 rounded-[3px]"
                              style={{
                                background: w.filledDays.includes(d) ? P.lime : P.surfaceHi,
                                border: `1px solid ${w.filledDays.includes(d) ? 'transparent' : P.line}`,
                                opacity: w.filledDays.includes(d) ? 0.85 : 1,
                              }}
                            />
                          ))}
                        </span>
                        {ws && (
                          <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: P.inkDim }}>
                            {fmtShort(ws)}-{fmtShort(addDays(ws, 6))}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-3">
              <MetaLabel>Ankeren op</MetaLabel>
              <div className="grid grid-cols-2 gap-1 mt-1.5 p-0.5 rounded-lg" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
                {([['start', 'Start op datum'], ['event', 'Streefdatum']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAnchor(v)}
                    className="py-1.5 rounded-md text-[11px] font-semibold transition-colors"
                    style={{
                      background: anchor === v ? P.surfaceHi : 'transparent',
                      color: anchor === v ? P.ink : P.inkMuted,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <MetaLabel>
                {anchor === 'start' ? 'Startdatum (week 1)' : 'Streefdatum (valt in de laatste week)'}
              </MetaLabel>
              <DarkInput
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className="mt-1.5 text-xs"
              />
            </div>

            <div className="mt-3">
              <MetaLabel>Bestaande inhoud in die weken</MetaLabel>
              <div className="grid grid-cols-2 gap-1 mt-1.5 p-0.5 rounded-lg" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
                {([['merge', 'Toevoegen'], ['replace', 'Vervangen']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMode(v)}
                    className="py-1.5 rounded-md text-[11px] font-semibold transition-colors"
                    style={{
                      background: mode === v ? P.surfaceHi : 'transparent',
                      color: mode === v ? P.ink : P.inkMuted,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {selected && range && (
              <p
                className="text-[11px] mt-3 p-2.5 rounded-lg leading-relaxed"
                style={{
                  color: P.inkMuted,
                  background: mode === 'replace' ? `color-mix(in srgb, ${P.brand} 7%, transparent)` : P.surfaceLow,
                  border: `1px solid ${mode === 'replace' ? `color-mix(in srgb, ${P.brand} 40%, transparent)` : P.line}`,
                }}
              >
                {anchor === 'start' ? (
                  <>Week 1 begint <b style={{ color: P.lime }}>ma {fmtShort(range.start)}</b>, laatste week eindigt{' '}
                    <b style={{ color: P.lime }}>zo {fmtShort(range.end)}</b>.</>
                ) : (
                  <>Streefdatum <b style={{ color: P.lime }}>{fmtShort(parseIsoDay(anchorDate))}</b> valt in week{' '}
                    {selected.weeks}, dus week 1 begint <b style={{ color: P.lime }}>ma {fmtShort(range.start)}</b>.</>
                )}{' '}
                {mode === 'merge'
                  ? 'Bestaande workouts in die weken blijven staan, het plan komt erbij.'
                  : <b style={{ color: P.brand }}>Alles wat er in die weken staat wordt gewist en vervangen.</b>}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <DarkButton variant="secondary" onClick={onClose} className="text-xs">Annuleren</DarkButton>
          <DarkButton
            disabled={!selected || apply.isPending}
            onClick={() => {
              if (!selected) return
              apply.mutate({ templateId: selected.id, patientId, anchorDate, anchor, mode })
            }}
            className="text-xs"
          >
            <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
            {apply.isPending
              ? 'Plaatsen…'
              : selected
                ? `Plaats ${selected.weeks} ${selected.weeks === 1 ? 'week' : 'weken'}`
                : 'Plaatsen'}
          </DarkButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ══ Plan verwijderen ══════════════════════════════════════════════════════
/**
 * De sjabloon-weken gaan mee via cascade. Atleten die het plan al op de
 * kalender hebben staan raken niets kwijt: `applyToPatient` kopieert en legt
 * geen link, dus daar staat losse data.
 *
 * Toon deze knop alleen als `canEdit` van `planTemplates.list` true is — de
 * server weigert de rest, en een knop die niets doet is erger dan geen knop.
 */
export function DeletePlanDialog({
  plan, onClose, onDeleted,
}: {
  plan: { id: string; name: string; weeks: number }
  onClose: () => void
  /** Na een geslaagde verwijdering. De editor navigeert weg, het overzicht niet. */
  onDeleted?: () => void
}) {
  const utils = trpc.useUtils()

  const remove = trpc.planTemplates.delete.useMutation({
    onSuccess: () => {
      utils.planTemplates.list.invalidate()
      toast.success(`${plan.name} verwijderd`)
      onClose()
      onDeleted?.()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.name} verwijderen</DialogTitle>
          <DialogDescription>
            Het plan en de {plan.weeks} {plan.weeks === 1 ? 'week' : 'weken'} die erin zitten
            verdwijnen. Atleten die dit plan al op hun kalender hebben staan houden hun weken:
            die zijn een kopie. Dit kun je niet terugdraaien.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <DarkButton variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Annuleren
          </DarkButton>
          <DarkButton
            variant="danger"
            onClick={() => remove.mutate({ id: plan.id })}
            disabled={remove.isPending}
            loading={remove.isPending}
          >
            Verwijderen
          </DarkButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ══ Opslaan als plan ══════════════════════════════════════════════════════
export function SavePlanDialog({
  patientId, fromDate, toDate, onClose, onSaved,
}: {
  patientId: string
  /** ISO-dagen uit de kalenderselectie; de maandagen eromheen zijn het bereik. */
  fromDate: string
  toDate: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const firstMonday = mondayOf(parseIsoDay(fromDate))
  const lastMonday = mondayOf(parseIsoDay(toDate))
  const weeks = Math.round((lastMonday.getTime() - firstMonday.getTime()) / (7 * 864e5)) + 1

  const utils = trpc.useUtils()
  const save = trpc.planTemplates.saveFromWeeks.useMutation({
    onSuccess: (r) => {
      toast.success('Opgeslagen als plan', {
        description: `${name.trim()} · ${r.weeks} ${r.weeks === 1 ? 'week' : 'weken'}`,
      })
      utils.planTemplates.list.invalidate()
      onSaved()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Opslaan als plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[11px] leading-relaxed" style={{ color: P.inkDim }}>
            De week van <b style={{ color: P.ink }}>ma {fmtShort(firstMonday)}</b> t/m{' '}
            <b style={{ color: P.ink }}>zo {fmtShort(addDays(lastMonday, 6))}</b> ({weeks}{' '}
            {weeks === 1 ? 'week' : 'weken'}) wordt gekopieerd naar een herbruikbaar plan voor je praktijk.
            De weken van deze patiënt blijven ongewijzigd.
          </p>

          <div>
            <MetaLabel>Naam</MetaLabel>
            <DarkInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bijv. Terugkeer hardlopen"
              className="mt-1.5"
            />
          </div>

          <div>
            <MetaLabel>Doel (optioneel)</MetaLabel>
            <DarkTextarea
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Waarvoor zet je dit plan in?"
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DarkButton variant="secondary" onClick={onClose} className="text-xs">Annuleren</DarkButton>
            <DarkButton
              disabled={name.trim() === '' || save.isPending}
              onClick={() => save.mutate({
                patientId,
                fromDate,
                toDate,
                name: name.trim(),
                goal: goal.trim() === '' ? undefined : goal.trim(),
              })}
              className="text-xs"
            >
              <Flag className="w-3.5 h-3.5 mr-1.5" />
              {save.isPending ? 'Opslaan…' : 'Opslaan als plan'}
            </DarkButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
