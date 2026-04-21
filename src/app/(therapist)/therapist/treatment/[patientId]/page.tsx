/**
 * Live-behandeling scherm voor therapeut.
 * Therapeut start een sessie vanuit patient-profiel, logt live sets+reps+pijn,
 * en submit naar `patients.logSessionForPatient`. Port van iOS-scherm
 * `mbt-gym/app/treatment/[patientId].tsx` (leanere web-variant).
 */
'use client'

import { use, useEffect, useMemo, useState } from 'react'
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
  PulsingDot,
  Tile,
} from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'

type LogRow = {
  uid: string
  exerciseId: string
  name: string
  targetSets: number
  targetReps: number
  repUnit: string
  setsCompleted: string // text-input
  repsCompleted: string
  weight: string
  painDuring: string
}

export default function TreatmentPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const router = useRouter()

  const { data: patient, isLoading: patientLoading } = trpc.patients.get.useQuery({ id: patientId })
  const { data: todayData, isLoading: todayLoading } = trpc.patient.getTodayExercises.useQuery({ patientId })
  const logMutation = trpc.patients.logSessionForPatient.useMutation({
    onSuccess: () => {
      toast.success('Sessie gelogd in patient dossier')
      router.push(`/therapist/patients/${patientId}`)
    },
    onError: (e) => toast.error(`Opslaan mislukt: ${e.message}`),
  })

  const [startedAt] = useState(() => new Date())
  const [mode, setMode] = useState<'choose' | 'program' | 'free'>('choose')
  const [rows, setRows] = useState<LogRow[]>([])
  const [dirty, setDirty] = useState(false) // gebruiker heeft lijst aangepast; niet meer auto-repoppen
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [exertionLevel, setExertionLevel] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [nowTick, setNowTick] = useState(Date.now())

  // Bij "Volg programma" → laad programma-oefeningen één keer in.
  // `dirty` voorkomt dat auto-repop na verwijderen van alle rijen gebeurt.
  useEffect(() => {
    if (mode === 'program' && todayData?.exercises && !dirty && rows.length === 0) {
      setRows(
        todayData.exercises.map((e) => ({
          uid: e.uid,
          exerciseId: e.exerciseId,
          name: e.name,
          targetSets: e.sets,
          targetReps: e.reps,
          repUnit: e.repUnit,
          setsCompleted: String(e.sets),
          repsCompleted: String(e.reps),
          weight: '',
          painDuring: '',
        })),
      )
    }
  }, [mode, todayData, dirty, rows.length])

  // Live timer tick
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const durationMin = Math.max(1, Math.round((nowTick - startedAt.getTime()) / 60000))

  const updateRow = (uid: string, patch: Partial<LogRow>) => {
    setDirty(true)
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }

  const removeRow = (uid: string) => {
    setDirty(true)
    setRows((prev) => prev.filter((r) => r.uid !== uid))
  }

  const resetToProgram = () => {
    setDirty(false)
    setRows([]) // triggert de useEffect opnieuw
  }

  const canSubmit = useMemo(() => rows.length > 0 && !logMutation.isPending, [rows, logMutation.isPending])

  function handleSubmit() {
    const now = new Date()
    logMutation.mutate({
      patientId,
      programId: todayData?.program?.id ?? undefined,
      scheduledAt: startedAt.toISOString(),
      completedAt: now.toISOString(),
      durationSeconds: Math.max(60, Math.round((now.getTime() - startedAt.getTime()) / 1000)),
      painLevel,
      exertionLevel,
      notes: notes.trim() || undefined,
      exercises: rows.map((r) => ({
        exerciseId: r.exerciseId,
        setsCompleted: r.setsCompleted ? Number(r.setsCompleted) : undefined,
        repsCompleted: r.repsCompleted ? Number(r.repsCompleted) : undefined,
        weight: r.weight ? Number(r.weight) : null,
        painDuring: r.painDuring ? Number(r.painDuring) : null,
      })),
    })
  }

  if (patientLoading || todayLoading) {
    return (
      <DarkScreen>
        <DarkHeader title="Live behandeling" backHref={`/therapist/patients/${patientId}`} />
        <div className="flex-1 flex items-center justify-center">
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        </div>
      </DarkScreen>
    )
  }

  if (!patient) {
    return (
      <DarkScreen>
        <DarkHeader title="Live behandeling" backHref="/therapist/patients" />
        <div className="max-w-lg w-full mx-auto px-4 py-8 text-center">
          <p style={{ color: P.inkMuted, fontSize: 14 }}>Patiënt niet gevonden of geen actieve koppeling.</p>
        </div>
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <DarkHeader
        title="Live behandeling"
        backHref={`/therapist/patients/${patientId}`}
        right={
          <span className="athletic-mono inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px]"
            style={{ color: P.lime, border: `1px solid ${P.lime}`, backgroundColor: P.surface }}>
            <PulsingDot color={P.lime} size={6} /> LIVE · {durationMin}M
          </span>
        }
      />

      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        {/* Patient header */}
        <div className="flex flex-col gap-1">
          <Kicker>Patient</Kicker>
          <h1 className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}>
            {(patient.name ?? patient.email).toUpperCase()}
          </h1>
          {todayData?.program && (
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              {todayData.program.name} · Week {todayData.program.currentWeek} · Dag {todayData.program.currentDay}
            </MetaLabel>
          )}
        </div>

        {/* Mode chooser */}
        {mode === 'choose' && (
          <section className="flex flex-col gap-3">
            <Kicker>Hoe wil je starten?</Kicker>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('program')}
                disabled={!todayData?.program}
                className="athletic-tap rounded-xl p-5 text-left"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.lime}`,
                  opacity: todayData?.program ? 1 : 0.4,
                }}
              >
                <Kicker>Volg programma</Kicker>
                <p style={{ color: P.ink, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  {todayData?.program?.name ?? 'Geen actief programma'}
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  {todayData?.exercises.length ?? 0} oefeningen voor vandaag. Je kunt tijdens de sessie aanpassen.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('free')}
                className="athletic-tap rounded-xl p-5 text-left"
                style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
              >
                <Kicker>Vrije workout</Kicker>
                <p style={{ color: P.ink, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  Leeg starten
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  Log wat je nu samen doet zonder programma als basis.
                </p>
              </button>
            </div>
          </section>
        )}

        {/* Exercise rows */}
        {mode !== 'choose' && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Kicker>Oefeningen · {rows.length}</Kicker>
            {mode === 'program' && dirty && (
              <button
                type="button"
                onClick={resetToProgram}
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em' }}
              >
                HERSTEL PROGRAMMA
              </button>
            )}
          </div>
          {rows.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 8 }}>
                Geen oefeningen voor vandaag in het programma. Log een vrije sessie met alleen notities.
              </p>
            </Tile>
          )}
          {rows.map((r) => (
            <Tile key={r.uid}>{/* exercise row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                  <div className="athletic-mono mt-0.5" style={{ color: P.inkMuted, fontSize: 11, textTransform: 'none', fontWeight: 500 }}>
                    Doel: {r.targetSets} × {r.targetReps} {r.repUnit}
                  </div>
                </div>
                <button type="button" onClick={() => removeRow(r.uid)}
                  className="athletic-tap athletic-mono"
                  style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.12em', padding: '4px 8px' }}>
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <LabeledInput label="Sets" value={r.setsCompleted} onChange={(v) => updateRow(r.uid, { setsCompleted: v })} inputMode="numeric" />
                <LabeledInput label={`Reps (${r.repUnit})`} value={r.repsCompleted} onChange={(v) => updateRow(r.uid, { repsCompleted: v })} inputMode="numeric" />
                <LabeledInput label="Gewicht (kg)" value={r.weight} onChange={(v) => updateRow(r.uid, { weight: v })} inputMode="decimal" />
                <LabeledInput label="Pijn /10" value={r.painDuring} onChange={(v) => updateRow(r.uid, { painDuring: v })} inputMode="numeric" />
              </div>
            </Tile>
          ))}
        </section>
        )}

        {/* Overall pain + RPE */}
        {mode !== 'choose' && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Tile>
            <MetaLabel>Algehele pijn /10</MetaLabel>
            <ScalePicker value={painLevel} onChange={setPainLevel} colorHigh={P.danger} />
          </Tile>
          <Tile>
            <MetaLabel>RPE (inspanning) /10</MetaLabel>
            <ScalePicker value={exertionLevel} onChange={setExertionLevel} colorHigh={P.gold} />
          </Tile>
        </section>
        )}

        {/* Notes */}
        {mode !== 'choose' && (
        <section className="flex flex-col gap-2">
          <MetaLabel>Notities</MetaLabel>
          <DarkTextarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Bevindingen, aanpassingen, vervolgplan…" rows={3} />
        </section>
        )}

        {mode !== 'choose' && (
        <DarkButton size="lg" onClick={handleSubmit}
          disabled={!canSubmit} loading={logMutation.isPending}>
          {logMutation.isPending ? 'OPSLAAN…' : `BEHANDELING AFRONDEN (${durationMin}M)`}
        </DarkButton>
        )}
      </div>
    </DarkScreen>
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
  onChange: (v: number) => void
  colorHigh: string
}) {
  return (
    <div className="grid grid-cols-11 gap-1 mt-2">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n
        const color = n >= 7 ? colorHigh : n >= 4 ? P.gold : P.lime
        return (
          <button key={n} type="button" onClick={() => onChange(n)}
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
