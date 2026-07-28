'use client'

/**
 * Spiervermoeidheid-SIMULATOR (dev-tool, geen auth).
 *
 * Voedt de ECHTE engine (computeMuscleFatigue) en het ECHTE lijst-component
 * (MuscleStatusListView) met zelf-samengestelde kracht- en cardiosessies, zodat
 * je het model en de UI kunt testen zonder login/database. Route ligt bewust
 * buiten de (patient)/(athlete)/(therapist) auth-groepen.
 *
 * Niet bedoeld voor productie — verwijderen of achter een dev-guard zetten
 * vóór een echte release.
 */

import { useMemo, useState } from 'react'
import { notFound } from 'next/navigation'
import {
  computeMuscleFatigue,
  type StrengthStimulus,
  type CardioStimulus,
} from '@/lib/muscle-fatigue'
import { MuscleStatusListView } from '@/components/recovery/MuscleStatusList'

const IOS = {
  bg: '#0E2729',
  surface: '#15363A',
  surfaceHi: '#1C4448',
  line: 'rgba(212,232,230,0.10)',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
  accent: '#E87A55',
} as const

type StrengthPreset = {
  label: string
  muscleLoads: Record<string, number>
  movementPattern: string
  loadType: string
  category: string
  reps: number
  repUnit: string
  sets: number
  rpe: number
}

const STRENGTH_PRESETS: StrengthPreset[] = [
  { label: 'Squat (zwaar)', muscleLoads: { Quadriceps: 4, Glutes: 3, Core: 2, Onderrug: 1 }, movementPattern: 'SQUAT', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 5, repUnit: 'reps', sets: 4, rpe: 8 },
  { label: 'Romanian deadlift', muscleLoads: { Hamstrings: 4, Glutes: 3, Onderrug: 2, Core: 1 }, movementPattern: 'HINGE', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 8, repUnit: 'reps', sets: 3, rpe: 8 },
  { label: 'Lunges', muscleLoads: { Quadriceps: 3, Glutes: 3, Hamstrings: 2, Core: 1 }, movementPattern: 'LUNGE', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 10, repUnit: 'reps', sets: 3, rpe: 7 },
  { label: 'Bench press', muscleLoads: { Borst: 4, Armen: 3, Schouders: 2 }, movementPattern: 'PUSH_HORIZONTAL', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 8, repUnit: 'reps', sets: 3, rpe: 8 },
  { label: 'Pull-up / row', muscleLoads: { Bovenrug: 4, Armen: 3, Core: 1 }, movementPattern: 'PULL_VERTICAL', loadType: 'BODYWEIGHT', category: 'STRENGTH', reps: 8, repUnit: 'reps', sets: 3, rpe: 8 },
  { label: 'Overhead press', muscleLoads: { Schouders: 4, Armen: 2, Core: 1 }, movementPattern: 'PUSH_VERTICAL', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 8, repUnit: 'reps', sets: 3, rpe: 7 },
  { label: 'Calf raises', muscleLoads: { Onderbeen: 4 }, movementPattern: 'CALF_RAISE', loadType: 'WEIGHTED', category: 'STRENGTH', reps: 12, repUnit: 'reps', sets: 4, rpe: 7 },
  { label: 'Wall-sit ISO (45s)', muscleLoads: { Quadriceps: 3 }, movementPattern: 'SQUAT', loadType: 'BODYWEIGHT', category: 'STABILITY', reps: 45, repUnit: 'sec', sets: 3, rpe: 6 },
  { label: 'Plank (60s)', muscleLoads: { Core: 3 }, movementPattern: 'CORE', loadType: 'BODYWEIGHT', category: 'STABILITY', reps: 60, repUnit: 'sec', sets: 3, rpe: 5 },
]

type CardioPreset = {
  label: string
  activity: string
  durationMin: number
  rpe: number
}

const CARDIO_PRESETS: CardioPreset[] = [
  { label: 'Duurloop 60 min', activity: 'RUNNING', durationMin: 60, rpe: 7 },
  { label: 'Rustige fietsrit 30 min', activity: 'CYCLING', durationMin: 30, rpe: 3 },
  { label: 'Roeien 20 min', activity: 'ROWING', durationMin: 20, rpe: 6 },
  { label: 'Wandeling 45 min', activity: 'WALKING', durationMin: 45, rpe: 2 },
  { label: 'Crosstrainer 30 min', activity: 'CROSSTRAINER', durationMin: 30, rpe: 5 },
  { label: 'Traploper 20 min', activity: 'STAIRCLIMBER', durationMin: 20, rpe: 6 },
]

type Entry =
  | { kind: 'strength'; id: number; hoursAgo: number; preset: StrengthPreset }
  | { kind: 'cardio'; id: number; hoursAgo: number; preset: CardioPreset }

let nextId = 1

export default function MuscleFatigueSimulatorPage() {
  // Dev-tool: niet bereikbaar in productie.
  if (process.env.NODE_ENV === 'production') notFound()
  return <Simulator />
}

function Simulator() {
  const [entries, setEntries] = useState<Entry[]>([
    { kind: 'strength', id: nextId++, hoursAgo: 18, preset: STRENGTH_PRESETS[0] },
    { kind: 'strength', id: nextId++, hoursAgo: 18, preset: STRENGTH_PRESETS[1] },
  ])

  const states = useMemo(() => {
    const now = Date.now()
    const at = (h: number) => new Date(now - h * 3_600_000)
    const strength: StrengthStimulus[] = entries
      .filter((e): e is Extract<Entry, { kind: 'strength' }> => e.kind === 'strength')
      .map((e) => ({
        muscleLoads: e.preset.muscleLoads,
        sets: e.preset.sets,
        reps: e.preset.reps,
        repUnit: e.preset.repUnit,
        completedAt: at(e.hoursAgo),
        rpe: e.preset.rpe,
        movementPattern: e.preset.movementPattern,
        loadType: e.preset.loadType,
        category: e.preset.category,
      }))
    const cardio: CardioStimulus[] = entries
      .filter((e): e is Extract<Entry, { kind: 'cardio' }> => e.kind === 'cardio')
      .map((e) => ({
        activity: e.preset.activity,
        durationMin: e.preset.durationMin,
        completedAt: at(e.hoursAgo),
        rpe: e.preset.rpe,
      }))
    return computeMuscleFatigue(strength, cardio)
  }, [entries])

  const addStrength = (preset: StrengthPreset) =>
    setEntries((e) => [...e, { kind: 'strength', id: nextId++, hoursAgo: 4, preset }])
  const addCardio = (preset: CardioPreset) =>
    setEntries((e) => [...e, { kind: 'cardio', id: nextId++, hoursAgo: 4, preset }])
  const remove = (id: number) => setEntries((e) => e.filter((x) => x.id !== id))
  const setHours = (id: number, hoursAgo: number) =>
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, hoursAgo } : x)))

  return (
    <div style={{ minHeight: '100vh', background: IOS.bg, color: IOS.ink, padding: '28px 20px 60px', fontFamily: '-apple-system, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>Spiervermoeidheid-simulator</h1>
        <p style={{ color: IOS.inkMuted, fontSize: 13, marginTop: 6, marginBottom: 24 }}>
          Voegt sessies toe en voert ze door de <b>echte</b> engine + lijst. Stel per sessie in hoeveel uur geleden hij was; de lijst rechts werkt real-time bij.
        </p>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Linker kolom: bouwers */}
          <div style={{ flex: '1 1 420px', minWidth: 320 }}>
            <Section title="Krachtsessie toevoegen">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STRENGTH_PRESETS.map((p) => (
                  <Chip key={p.label} onClick={() => addStrength(p)}>{p.label}</Chip>
                ))}
              </div>
            </Section>

            <Section title="Cardiosessie toevoegen">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CARDIO_PRESETS.map((p) => (
                  <Chip key={p.label} onClick={() => addCardio(p)} accent>{p.label}</Chip>
                ))}
              </div>
            </Section>

            <Section title={`Toegevoegde sessies (${entries.length})`}>
              {entries.length === 0 ? (
                <div style={{ color: IOS.inkMuted, fontSize: 13 }}>Nog niets toegevoegd.</div>
              ) : (
                entries.map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${IOS.line}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: e.kind === 'cardio' ? '#9FCEC9' : IOS.accent }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{e.preset.label}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: IOS.inkMuted }}>
                      <input
                        type="range"
                        min={0}
                        max={168}
                        step={1}
                        value={e.hoursAgo}
                        onChange={(ev) => setHours(e.id, Number(ev.target.value))}
                        style={{ width: 120, accentColor: IOS.accent }}
                      />
                      <span style={{ width: 54, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAgo(e.hoursAgo)}</span>
                    </label>
                    <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', color: IOS.inkMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }} aria-label="verwijder">×</button>
                  </div>
                ))
              )}
              {entries.length > 0 && (
                <button onClick={() => setEntries([])} style={{ marginTop: 12, background: 'none', border: `1px solid ${IOS.line}`, color: IOS.inkMuted, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                  Alles wissen
                </button>
              )}
            </Section>
          </div>

          {/* Rechter kolom: het echte component */}
          <div style={{ flex: '0 0 320px', width: 320, position: 'sticky', top: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: IOS.inkMuted, marginBottom: 10 }}>
              Live resultaat (echt component)
            </div>
            <MuscleStatusListView states={states} />
            <p style={{ color: '#86A3A1', fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>
              Herstelde regio&apos;s (≥95%) vallen weg. Cardio belast de benen mee: een duurloop meer dan een fietsrit. Kleuren: groen hersteld → goud → oranje → rood zwaar belast.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: IOS.inkMuted, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Chip({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: IOS.surface,
        border: `1px solid ${accent ? 'rgba(159,206,201,0.35)' : 'rgba(232,122,85,0.35)'}`,
        color: IOS.ink,
        borderRadius: 999,
        padding: '7px 13px',
        fontSize: 12.5,
        cursor: 'pointer',
      }}
    >
      + {children}
    </button>
  )
}

function fmtAgo(h: number) {
  if (h === 0) return 'nu'
  if (h < 24) return `${h}u`
  const d = Math.floor(h / 24)
  const r = h % 24
  return r === 0 ? `${d}d` : `${d}d ${r}u`
}
