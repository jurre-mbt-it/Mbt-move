/**
 * Bewerk een eerder gelogde sessie. Therapeut komt hier via de 'BEWERK'
 * knop op patient-detail. Editbaar: scheduledAt, duration, painLevel,
 * exertionLevel, notes, en alle per-exercise velden.
 */
'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import {
  STANDARD_PARAMS,
  SUPERSET_COLORS,
  SUPERSET_LETTERS,
} from '@/lib/program-constants'

type ParamType = 'number' | 'text' | 'select' | 'slider'

type EditExtraParam = {
  id: string
  label: string
  type: ParamType
  value: string | number
  unit?: string
  options?: string[]
  min?: number
  max?: number
}

type EditRow = {
  id: string                  // existing exerciseLog id (or new-…)
  exerciseId: string
  name: string
  setsCompleted: string
  repsCompleted: string
  weightsPerSet: string[]
  extraParams: EditExtraParam[]
  supersetGroup: string | null
  painDuring: string
}

function fromServerParams(raw: unknown): EditExtraParam[] {
  if (!Array.isArray(raw)) return []
  const out: EditExtraParam[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const type: ParamType =
      p.type === 'number' || p.type === 'text' || p.type === 'select' || p.type === 'slider'
        ? p.type
        : 'number'
    out.push({
      id: typeof p.id === 'string' ? p.id : `p-${Math.random().toString(36).slice(2, 8)}`,
      label: String(p.label ?? ''),
      type,
      value: typeof p.value === 'string' || typeof p.value === 'number' ? p.value : 0,
      unit: typeof p.unit === 'string' ? p.unit : undefined,
      options: Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === 'string') : undefined,
      min: typeof p.min === 'number' ? p.min : undefined,
      max: typeof p.max === 'number' ? p.max : undefined,
    })
  }
  return out
}

function resizeWeights(current: string[], targetCount: number): string[] {
  if (targetCount <= 0) return ['']
  if (current.length === targetCount) return current
  if (current.length > targetCount) return current.slice(0, targetCount)
  return [...current, ...Array(targetCount - current.length).fill('')]
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n) }
function toDateInput(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function toTimeInput(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }

export default function EditSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id: patientId, sessionId } = use(params)
  const router = useRouter()

  const { data: session, isLoading } = trpc.patients.getSessionLog.useQuery({ sessionId })
  const updateMutation = trpc.patients.updateSessionLog.useMutation({
    onSuccess: () => {
      toast.success('Sessie bijgewerkt')
      router.push(`/therapist/patients/${patientId}`)
    },
    onError: (e) => toast.error(`Opslaan mislukt: ${e.message}`),
  })

  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [exertionLevel, setExertionLevel] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<EditRow[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!session || hydrated) return
    const sched = session.scheduledAt ? new Date(session.scheduledAt) : new Date()
    setScheduledDate(toDateInput(sched))
    setScheduledTime(toTimeInput(sched))
    setDurationMin(session.durationSeconds ? String(Math.round(session.durationSeconds / 60)) : '')
    setPainLevel(session.painLevel ?? null)
    setExertionLevel(session.exertionLevel ?? null)
    setNotes(session.notes ?? '')
    setRows(session.exercises.map((ex) => {
      const setsCount = Math.max(1, ex.setsCompleted ?? 1)
      const existingWeights = Array.isArray(ex.weightsPerSet)
        ? ex.weightsPerSet.map((w) => w == null ? '' : String(w))
        : ex.weight != null
          ? [String(ex.weight)]
          : []
      return {
        id: ex.id,
        exerciseId: ex.exerciseId,
        name: ex.name,
        setsCompleted: ex.setsCompleted != null ? String(ex.setsCompleted) : '',
        repsCompleted: ex.repsCompleted != null ? String(ex.repsCompleted) : '',
        weightsPerSet: resizeWeights(existingWeights, setsCount),
        extraParams: fromServerParams(ex.extraParams),
        supersetGroup: ex.supersetGroup ?? null,
        painDuring: ex.painDuring != null ? String(ex.painDuring) : '',
      }
    }))
    setHydrated(true)
  }, [session, hydrated])

  const updateRow = (id: string, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r
      const merged = { ...r, ...patch }
      if (patch.setsCompleted !== undefined) {
        const target = Math.max(1, Number(patch.setsCompleted) || 1)
        merged.weightsPerSet = resizeWeights(merged.weightsPerSet, target)
      }
      return merged
    }))
  }

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))

  const addExtraParam = (id: string, tpl: typeof STANDARD_PARAMS[number]) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r
      if (r.extraParams.some((p) => p.label === tpl.label)) return r
      const tplAny = tpl as typeof tpl & { min?: number; max?: number; options?: string[] }
      return {
        ...r,
        extraParams: [...r.extraParams, {
          id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: tpl.label,
          type: tpl.type,
          value: tpl.type === 'number' || tpl.type === 'slider' ? 0 : '',
          unit: 'unit' in tpl ? tpl.unit : undefined,
          options: tplAny.options,
          min: tplAny.min,
          max: tplAny.max,
        }],
      }
    }))
  }

  const updateExtraParam = (id: string, paramId: string, value: string | number) => {
    setRows((prev) => prev.map((r) => r.id !== id ? r : {
      ...r,
      extraParams: r.extraParams.map((p) => p.id === paramId ? { ...p, value } : p),
    }))
  }

  const removeExtraParam = (id: string, paramId: string) => {
    setRows((prev) => prev.map((r) => r.id !== id ? r : {
      ...r,
      extraParams: r.extraParams.filter((p) => p.id !== paramId),
    }))
  }

  const setSupersetGroup = (id: string, group: string | null) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, supersetGroup: group } : r))
  }

  function handleSubmit() {
    // Combineer datum + tijd naar ISO
    const [y, m, d] = scheduledDate.split('-').map(Number)
    const [hh, mm] = scheduledTime.split(':').map(Number)
    const scheduled = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0)
    const durationSeconds = durationMin ? Math.max(0, Math.round(Number(durationMin) * 60)) : undefined

    updateMutation.mutate({
      sessionId,
      scheduledAt: scheduled.toISOString(),
      durationSeconds,
      painLevel,
      exertionLevel,
      notes: notes.trim() || null,
      exercises: rows.map((r) => {
        const weights = r.weightsPerSet.map((w) => w === '' ? null : Number(w))
          .map((n) => (n === null || Number.isNaN(n)) ? null : n)
        const lastFilled = [...weights].reverse().find((n) => n !== null) ?? null
        return {
          exerciseId: r.exerciseId,
          setsCompleted: r.setsCompleted ? Number(r.setsCompleted) : null,
          repsCompleted: r.repsCompleted ? Number(r.repsCompleted) : null,
          weight: lastFilled,
          weightsPerSet: weights,
          extraParams: r.extraParams.length ? r.extraParams : null,
          supersetGroup: r.supersetGroup,
          painDuring: r.painDuring ? Number(r.painDuring) : null,
        }
      }),
    })
  }

  if (isLoading || !session) {
    return (
      <DarkScreen>
        <DarkHeader title="Sessie bewerken" backHref={`/therapist/patients/${patientId}`} />
        <div className="flex-1 flex items-center justify-center">
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        </div>
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <DarkHeader title="Sessie bewerken" backHref={`/therapist/patients/${patientId}`} />

      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        {/* Datum/tijd/duur */}
        <Tile>
          <Kicker>Sessiedetails</Kicker>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="flex flex-col gap-1">
              <MetaLabel>Datum</MetaLabel>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                style={{
                  background: P.surfaceHi,
                  border: `1px solid ${P.lineStrong}`,
                  color: P.ink,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <MetaLabel>Tijd</MetaLabel>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{
                  background: P.surfaceHi,
                  border: `1px solid ${P.lineStrong}`,
                  color: P.ink,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <MetaLabel>Duur (min)</MetaLabel>
              <DarkInput
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                inputMode="numeric"
                style={{ padding: '8px 10px', fontSize: 13 }}
              />
            </div>
          </div>
          {/* Wie heeft deze sessie uitgevoerd? Read-only info — niet
              wijzigbaar via deze knop om audit-integriteit te behouden. */}
          <div className="mt-3 flex items-center gap-2">
            <MetaLabel>Door</MetaLabel>
            <span
              className="athletic-mono"
              style={{ color: P.ink, fontSize: 12, letterSpacing: '0.04em' }}
            >
              {session.therapistId === null
                ? '—'
                : session.therapistId === session.patientId
                  ? 'Patiënt zelf'
                  : session.therapistName ?? 'Onbekend'}
            </span>
          </div>
        </Tile>

        {/* Oefeningen */}
        <section className="flex flex-col gap-2">
          <Kicker>Oefeningen · {rows.length}</Kicker>
          {rows.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 8 }}>
                Geen oefeningen in deze sessie.
              </p>
            </Tile>
          )}
          {rows.map((r) => (
            <EditExerciseTile
              key={r.id}
              row={r}
              onUpdate={updateRow}
              onRemove={removeRow}
              onAddParam={addExtraParam}
              onUpdateParam={updateExtraParam}
              onRemoveParam={removeExtraParam}
              onSetSuperset={setSupersetGroup}
            />
          ))}
        </section>

        {/* Overall pain + RPE */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Tile accentBar={P.danger}>
            <MetaLabel style={{ color: P.danger }}>PIJN /10</MetaLabel>
            <ScalePicker value={painLevel} onChange={setPainLevel} colorHigh={P.danger} />
          </Tile>
          <Tile accentBar={P.gold}>
            <MetaLabel style={{ color: P.gold }}>RPE /10</MetaLabel>
            <ScalePicker value={exertionLevel} onChange={setExertionLevel} colorHigh={P.gold} />
          </Tile>
        </section>

        {/* Notes */}
        <section className="flex flex-col gap-2">
          <MetaLabel>Notities</MetaLabel>
          <DarkTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </section>

        <DarkButton size="lg" onClick={handleSubmit} loading={updateMutation.isPending}>
          {updateMutation.isPending ? 'OPSLAAN…' : 'WIJZIGINGEN OPSLAAN'}
        </DarkButton>
      </div>
    </DarkScreen>
  )
}

function EditExerciseTile({
  row: r,
  onUpdate,
  onRemove,
  onAddParam,
  onUpdateParam,
  onRemoveParam,
  onSetSuperset,
}: {
  row: EditRow
  onUpdate: (id: string, patch: Partial<EditRow>) => void
  onRemove: (id: string) => void
  onAddParam: (id: string, tpl: typeof STANDARD_PARAMS[number]) => void
  onUpdateParam: (id: string, paramId: string, value: string | number) => void
  onRemoveParam: (id: string, paramId: string) => void
  onSetSuperset: (id: string, group: string | null) => void
}) {
  const [paramMenuOpen, setParamMenuOpen] = useState(false)
  const [supersetMenuOpen, setSupersetMenuOpen] = useState(false)
  const setsCount = Math.max(1, Number(r.setsCompleted) || 1)
  const weights = r.weightsPerSet.length === setsCount ? r.weightsPerSet : resizeWeights(r.weightsPerSet, setsCount)
  const availableParams = STANDARD_PARAMS.filter((p) => !r.extraParams.some((ep) => ep.label === p.label))

  return (
    <Tile>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {r.supersetGroup && (
              <span
                className="athletic-mono"
                style={{
                  color: SUPERSET_COLORS[r.supersetGroup]?.text ?? P.ink,
                  background: SUPERSET_COLORS[r.supersetGroup]?.bg ?? P.surfaceHi,
                  border: `1px solid ${SUPERSET_COLORS[r.supersetGroup]?.border ?? P.lineStrong}`,
                  fontSize: 10, fontWeight: 900, letterSpacing: '0.1em',
                  padding: '1px 5px', borderRadius: 4,
                }}
              >
                {r.supersetGroup}
              </span>
            )}
            <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{r.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={() => { setSupersetMenuOpen((v) => !v); setParamMenuOpen(false) }}
            title="Superset-groep"
            className="athletic-tap athletic-mono"
            style={{
              color: r.supersetGroup ? (SUPERSET_COLORS[r.supersetGroup]?.text ?? P.lime) : P.inkMuted,
              fontSize: 11, letterSpacing: '0.1em', padding: '4px 6px',
              border: `1px solid ${r.supersetGroup ? (SUPERSET_COLORS[r.supersetGroup]?.border ?? P.lime) : P.lineStrong}`,
              borderRadius: 4, fontWeight: 900,
            }}
          >
            {r.supersetGroup ?? 'SS'}
          </button>
          {supersetMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-10 rounded-lg p-2 flex flex-col gap-1"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, minWidth: 140 }}
            >
              <button
                type="button"
                onClick={() => { onSetSuperset(r.id, null); setSupersetMenuOpen(false) }}
                className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}
              >
                GEEN SUPERSET
              </button>
              {SUPERSET_LETTERS.map((letter) => {
                const c = SUPERSET_COLORS[letter]
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => { onSetSuperset(r.id, letter); setSupersetMenuOpen(false) }}
                    className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                    style={{
                      background: r.supersetGroup === letter ? c.bg : 'transparent',
                      color: c.text, fontSize: 11, letterSpacing: '0.08em', fontWeight: 800,
                      border: `1px solid ${r.supersetGroup === letter ? c.border : 'transparent'}`,
                    }}
                  >
                    SUPERSET {letter}
                  </button>
                )
              })}
            </div>
          )}
          <button type="button" onClick={() => onRemove(r.id)}
            className="athletic-tap athletic-mono"
            style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.12em', padding: '4px 8px' }}>
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <LabeledInput label="Sets" value={r.setsCompleted} onChange={(v) => onUpdate(r.id, { setsCompleted: v })} inputMode="numeric" />
        <LabeledInput label="Reps" value={r.repsCompleted} onChange={(v) => onUpdate(r.id, { repsCompleted: v })} inputMode="numeric" />
        <LabeledInput label="Pijn /10" value={r.painDuring} onChange={(v) => onUpdate(r.id, { painDuring: v })} inputMode="numeric" />
      </div>

      <div className="mt-3">
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
          GEWICHT (KG) · PER SET
        </span>
        <div className="grid gap-1.5 mt-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(setsCount, 6)}, minmax(0, 1fr))` }}>
          {weights.map((w, idx) => (
            <div key={idx} className="flex flex-col gap-0.5">
              <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.1em' }}>S{idx + 1}</span>
              <DarkInput
                value={w}
                onChange={(e) => {
                  const next = [...weights]
                  next[idx] = e.target.value
                  onUpdate(r.id, { weightsPerSet: next })
                }}
                inputMode="decimal"
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </div>
          ))}
        </div>
      </div>

      {r.extraParams.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.extraParams.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, fontSize: 12 }}
            >
              <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}>
                {p.label.toUpperCase()}
              </span>
              {p.type === 'number' ? (
                <input
                  type="number"
                  value={p.value as number}
                  min={p.min}
                  max={p.max}
                  onChange={(e) => onUpdateParam(r.id, p.id, Number(e.target.value))}
                  className="bg-transparent text-center font-semibold focus:outline-none"
                  style={{ color: P.ink, width: 48, fontSize: 13 }}
                />
              ) : p.type === 'slider' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={p.min ?? 0}
                    max={p.max ?? 10}
                    value={p.value as number}
                    onChange={(e) => onUpdateParam(r.id, p.id, Number(e.target.value))}
                    className="w-16 h-1"
                    style={{ accentColor: P.lime }}
                  />
                  <span className="font-semibold" style={{ color: P.ink, width: 20, textAlign: 'center', fontSize: 13 }}>
                    {p.value}
                  </span>
                </div>
              ) : p.type === 'select' && p.options ? (
                <select
                  value={p.value as string}
                  onChange={(e) => onUpdateParam(r.id, p.id, e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none"
                  style={{ color: P.ink }}
                >
                  <option value="">—</option>
                  {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={p.value as string}
                  onChange={(e) => onUpdateParam(r.id, p.id, e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none"
                  style={{ color: P.ink, width: 64 }}
                />
              )}
              {p.unit && (
                <span style={{ color: P.inkDim, fontSize: 10 }}>{p.unit}</span>
              )}
              <button
                type="button"
                onClick={() => onRemoveParam(r.id, p.id)}
                aria-label={`Verwijder ${p.label}`}
                style={{ color: P.inkDim, fontSize: 11, marginLeft: 2 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {availableParams.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 relative">
          <button
            type="button"
            onClick={() => { setParamMenuOpen((v) => !v); setSupersetMenuOpen(false) }}
            className="athletic-mono athletic-tap px-2 py-1 rounded-full"
            style={{
              background: P.surfaceHi, color: P.brand,
              border: `1px dashed ${P.brand}`,
              fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
            }}
          >
            + PARAMETER
          </button>
          {paramMenuOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-10 rounded-lg p-1.5 flex flex-col gap-0.5"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, minWidth: 180 }}
            >
              {availableParams.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onAddParam(r.id, p); setParamMenuOpen(false) }}
                  className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                  style={{ color: P.ink, fontSize: 11, letterSpacing: '0.06em' }}
                >
                  + {p.label.toUpperCase()}
                  {'unit' in p && p.unit && (
                    <span style={{ color: P.inkDim, marginLeft: 4 }}>{p.unit}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Tile>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'numeric' | 'decimal' | 'text'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
        {label.toUpperCase()}
      </span>
      <DarkInput value={value} onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode} style={{ padding: '8px 10px', fontSize: 14 }} />
    </div>
  )
}

function ScalePicker({
  value,
  onChange,
  colorHigh,
}: {
  value: number | null
  onChange: (v: number | null) => void
  colorHigh: string
}) {
  return (
    <div className="grid grid-cols-11 gap-1 mt-2">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n
        const color = n >= 7 ? colorHigh : n >= 4 ? P.gold : P.lime
        return (
          <button key={n} type="button" onClick={() => onChange(active ? null : n)}
            className="athletic-tap athletic-mono aspect-square rounded flex items-center justify-center"
            style={{
              background: active ? color : P.surfaceHi,
              color: active ? P.bg : P.inkMuted,
              border: active ? `1px solid ${color}` : `1px solid ${P.lineStrong}`,
              fontSize: 12, fontWeight: 900,
            }}>
            {n}
          </button>
        )
      })}
    </div>
  )
}
