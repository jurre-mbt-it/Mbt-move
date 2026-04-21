'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  Play, Pause, Square, Heart, CheckCircle2, ChevronLeft,
  Volume2, VolumeX, SkipForward,
} from 'lucide-react'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, HR_ZONES, HRZone } from '@/lib/cardio-constants'
import { cn } from '@/lib/utils'
import { CARDIO_ICON_MAP, IconRunning, IconWalking, IconWarning, IconFinishFlag, IconCheck } from '@/components/icons'

const MBT_GREEN = '#BEF264'
const MBT_TEAL = '#BEF264'
const MBT_DARK = '#1C2425'

// ── Mock sessie data ──────────────────────────────────────────────────────────

const MOCK_SESSION = {
  id: 'cs-mock-1',
  programName: 'Walk-Run Terugkeer Protocol — Knie',
  activity: 'RUNNING' as const,
  protocol: 'WALK_RUN' as const,
  week: 3,
  session: 2,
  targetDurationMin: 18,
  targetZone: 2 as HRZone,
  intervals: [
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
    { label: 'Wandelen', type: 'WALK', durationSec: 120 },
    { label: 'Lopen',    type: 'RUN',  durationSec: 60 },
  ],
}

type SessionPhase = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'DONE'

// ── Audio cue helper ──────────────────────────────────────────────────────────

function useAudioCues(enabled: boolean) {
  const playBeep = useCallback((freq = 880, duration = 0.2) => {
    if (!enabled || typeof window === 'undefined') return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch { /* silently fail */ }
  }, [enabled])

  return { playBeep }
}

// ── Circulaire timer ──────────────────────────────────────────────────────────

function CircularTimer({
  seconds,
  total,
  color,
  label,
}: {
  seconds: number
  total: number
  color: string
  label: string
}) {
  const r = 80
  const circ = 2 * Math.PI * r
  const progress = total > 0 ? seconds / total : 0
  const offset = circ * (1 - progress)

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <div className="relative w-52 h-52 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        <circle
          cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tabular-nums" style={{ color }}>
          {mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : secs}
        </span>
        <span className="text-sm text-muted-foreground mt-1">{label}</span>
      </div>
    </div>
  )
}

// ── Smiley RPE feedback ───────────────────────────────────────────────────────

// SVG smiley faces — flat style matching the icon set
function SmileySVG({ expression, size = 28, color }: { expression: 'exhausted' | 'unhappy' | 'neutral' | 'happy' | 'great'; size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      {/* Eyes */}
      {expression === 'exhausted' ? (
        <>
          <line x1="7" y1="9" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="14" y1="10" x2="17" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="9.5" r="1.2" fill={color} />
          <circle cx="15.5" cy="9.5" r="1.2" fill={color} />
        </>
      )}
      {/* Mouth */}
      {expression === 'exhausted' && <path d="M9 16c1-1.5 5-1.5 6 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
      {expression === 'unhappy' && <path d="M9 16c1-1.5 5-1.5 6 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
      {expression === 'neutral' && <line x1="9" y1="15" x2="15" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
      {expression === 'happy' && <path d="M9 14c1 1.5 5 1.5 6 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
      {expression === 'great' && <path d="M8 13c1 3 7 3 8 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  )
}
const SMILEY_EXPRESSIONS: Array<'exhausted' | 'unhappy' | 'neutral' | 'happy' | 'great'> = ['exhausted', 'unhappy', 'neutral', 'happy', 'great']
const SMILEY_LABELS = ['Zwaar', 'Moeilijk', 'Oké', 'Goed', 'Super']
const SMILEY_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', MBT_GREEN]

function FeedbackModal({
  onSubmit,
}: {
  onSubmit: (data: { rpe: number; painLevel: number; hrAvg: number | null; distance: number | null }) => void
}) {
  const [rpe, setRpe] = useState(3)
  const [painLevel, setPainLevel] = useState(0)
  const [hrInput, setHrInput] = useState('')
  const [distInput, setDistInput] = useState('')

  const highPain = painLevel >= 5

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold mb-3">Hoe voelde de sessie?</p>
        <div className="flex gap-2">
          {SMILEY_EXPRESSIONS.map((expr, i) => (
            <button
              key={i}
              onClick={() => setRpe(i + 1)}
              className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border transition-all"
              style={rpe === i + 1 ? { borderColor: SMILEY_COLORS[i], background: SMILEY_COLORS[i] + '20' } : {}}
            >
              <SmileySVG expression={expr} color={SMILEY_COLORS[i]} />
              <span className="text-xs">{SMILEY_LABELS[i]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Pijn knie / enkel / voet? (0-10)</p>
        <div className="flex items-center gap-3">
          <input
            type="range" min={0} max={10} step={1}
            value={painLevel}
            onChange={e => setPainLevel(+e.target.value)}
            className="flex-1"
            style={{ accentColor: painLevel >= 5 ? '#ef4444' : MBT_GREEN }}
          />
          <span className="w-8 text-center font-bold text-lg" style={{ color: painLevel >= 5 ? '#ef4444' : MBT_GREEN }}>
            {painLevel}
          </span>
        </div>
        {highPain && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
            <IconWarning size={16} />
            <span>Pijn &gt; 5/10 — Volgende sessie wordt herhaald. Therapeut wordt op de hoogte gesteld.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium mb-1 flex items-center gap-1">
            <Heart className="w-3 h-3 text-red-400" /> Gem. hartslag (optioneel)
          </p>
          <input
            type="number" min={60} max={220} placeholder="bijv. 145"
            value={hrInput}
            onChange={e => setHrInput(e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">Afstand (km, optioneel)</p>
          <input
            type="number" min={0} step={0.1} placeholder="bijv. 2.4"
            value={distInput}
            onChange={e => setDistInput(e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <Button
        className="w-full"
        style={{ background: highPain ? '#ef4444' : MBT_GREEN }}
        onClick={() => onSubmit({
          rpe: rpe * 2,
          painLevel,
          hrAvg: hrInput ? +hrInput : null,
          distance: distInput ? +distInput : null,
        })}
      >
        {highPain ? <span className="inline-flex items-center gap-1"><IconWarning size={16} /> Sessie afsluiten (pijn gemeld)</span> : <span className="inline-flex items-center gap-1"><IconCheck size={16} /> Sessie afsluiten</span>}
      </Button>
    </div>
  )
}

// ── Hoofd component ───────────────────────────────────────────────────────────

export default function CardioSessionPage() {
  const router = useRouter()
  const session = MOCK_SESSION

  const [phase, setPhase] = useState<SessionPhase>('IDLE')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [currentIntervalIdx, setCurrentIntervalIdx] = useState(0)
  const [intervalRemaining, setIntervalRemaining] = useState(
    session.intervals.length > 0 ? session.intervals[0].durationSec : 0
  )
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { playBeep } = useAudioCues(soundEnabled)

  const currentInterval = session.intervals[currentIntervalIdx]
  const isIntervalMode = session.intervals.length > 0
  const hasIntervals = session.intervals.length > 0

  // ── Timer tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ACTIVE') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setElapsedSec(e => e + 1)

      if (isIntervalMode) {
        setIntervalRemaining(prev => {
          if (prev <= 1) {
            // Interval voltooid
            setCurrentIntervalIdx(idx => {
              const next = idx + 1
              if (next >= session.intervals.length) {
                // Sessie klaar
                setPhase('DONE')
                setShowFeedback(true)
                playBeep(440, 0.5)
                return idx
              }
              playBeep(880, 0.15)
              return next
            })
            return session.intervals[currentIntervalIdx + 1]?.durationSec ?? 0
          }

          // Waarschuwingsbeep bij 3 seconden
          if (prev === 4) playBeep(660, 0.1)

          return prev - 1
        })
      }
    }, 1000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phase, isIntervalMode, currentIntervalIdx, playBeep, session.intervals])

  // Sync interval remaining wanneer idx verandert
  useEffect(() => {
    if (session.intervals[currentIntervalIdx]) {
      setIntervalRemaining(session.intervals[currentIntervalIdx].durationSec)
    }
  }, [currentIntervalIdx, session.intervals])

  const handleStart = () => {
    setPhase('ACTIVE')
    playBeep(660, 0.2)
    toast('Sessie gestart! Succes!', { duration: 2000 })
  }

  const handlePause = () => setPhase('PAUSED')
  const handleResume = () => setPhase('ACTIVE')

  const handleStop = () => {
    setPhase('DONE')
    setShowFeedback(true)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const handleSkipInterval = () => {
    const next = currentIntervalIdx + 1
    if (next >= session.intervals.length) {
      setPhase('DONE')
      setShowFeedback(true)
    } else {
      setCurrentIntervalIdx(next)
      playBeep(880, 0.1)
    }
  }

  const handleFeedbackSubmit = (data: { rpe: number; painLevel: number; hrAvg: number | null; distance: number | null }) => {
    console.log('Cardio log:', { ...data, duration: elapsedSec })
    if (data.painLevel >= 5) {
      toast.error('Pijn gemeld aan therapeut. Volgende sessie wordt herhaald.')
    } else {
      toast.success('Cardio sessie opgeslagen! Goed gedaan!')
    }
    router.push('/patient/schedule')
  }

  const activityInfo = CARDIO_ACTIVITIES[session.activity]
  const protocolInfo = CARDIO_PROTOCOLS[session.protocol]
  const zoneInfo = HR_ZONES[session.targetZone]

  const elapsedMin = Math.floor(elapsedSec / 60)
  const elapsedSecs = elapsedSec % 60

  const isRun = currentInterval?.type === 'RUN'

  if (showFeedback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="mb-3"><IconFinishFlag size={48} /></div>
            <h2 className="text-xl font-bold">Sessie afgerond!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {elapsedMin}:{elapsedSecs.toString().padStart(2, '0')} actief · Week {session.week}, Sessie {session.session}
            </p>
          </div>
          <FeedbackModal onSubmit={handleFeedbackSubmit} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: phase === 'IDLE' ? undefined : MBT_DARK }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ color: phase !== 'IDLE' ? '#fff' : undefined }}>
        <button onClick={() => router.back()} className="opacity-70 hover:opacity-100">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center">
          <p className="text-xs opacity-70 uppercase tracking-wider flex items-center justify-center gap-1">{(() => { const Icon = CARDIO_ICON_MAP[session.activity]; return Icon ? <Icon size={14} /> : activityInfo.icon })()} {activityInfo.label}</p>
          <p className="text-sm font-semibold">{protocolInfo.label} — Week {session.week}</p>
        </div>
        <button onClick={() => setSoundEnabled(s => !s)} className="opacity-70 hover:opacity-100">
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-8">

        {/* Zone badge */}
        <div
          className="px-4 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: zoneInfo.color + '25', color: zoneInfo.color }}
        >
          {zoneInfo.label} ({zoneInfo.minPct}–{zoneInfo.maxPct}% HRmax)
        </div>

        {/* Circulaire timer / interval timer */}
        {hasIntervals && phase !== 'IDLE' ? (
          <div className="text-center">
            <CircularTimer
              seconds={intervalRemaining}
              total={currentInterval?.durationSec ?? 1}
              color={isRun ? MBT_GREEN : '#94a3b8'}
              label={currentInterval?.label ?? ''}
            />

            {/* Interval indicator */}
            <div className="mt-4">
              <p className="text-3xl font-bold" style={{ color: isRun ? MBT_GREEN : '#94a3b8' }}>
                <span className="inline-flex items-center gap-2">{isRun ? <><IconRunning size={28} /> LOPEN</> : <><IconWalking size={28} /> WANDELEN</>}</span>
              </p>
              <p className="text-sm opacity-70 mt-1" style={{ color: '#94a3b8' }}>
                Interval {currentIntervalIdx + 1} / {session.intervals.length}
              </p>
            </div>

            {/* Interval progress dots */}
            <div className="flex gap-1.5 justify-center mt-3 flex-wrap max-w-xs mx-auto">
              {session.intervals.map((iv, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full transition-all"
                  style={{
                    background: i < currentIntervalIdx
                      ? (iv.type === 'RUN' ? MBT_GREEN + '80' : '#94a3b880')
                      : i === currentIntervalIdx
                        ? (iv.type === 'RUN' ? MBT_GREEN : '#94a3b8')
                        : '#1e3a3a',
                    border: i === currentIntervalIdx ? '2px solid white' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Elapsed timer voor non-interval */
          <div className="text-center">
            <div className="relative">
              <p className="text-8xl font-bold tabular-nums" style={{ color: phase !== 'IDLE' ? '#fff' : MBT_GREEN }}>
                {elapsedMin.toString().padStart(2, '0')}:{elapsedSecs.toString().padStart(2, '0')}
              </p>
              <p className="text-sm mt-2" style={{ color: phase !== 'IDLE' ? '#94a3b8' : '#6b7280' }}>
                verstreken · doel {session.targetDurationMin} min
              </p>
            </div>

            {/* Voortgangsbalk */}
            {phase !== 'IDLE' && (
              <div className="w-64 mx-auto mt-4">
                <div className="h-2 rounded-full bg-[#141A1B]/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ background: MBT_GREEN, width: `${Math.min((elapsedSec / (session.targetDurationMin * 60)) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                  {Math.round((elapsedSec / (session.targetDurationMin * 60)) * 100)}% voltooid
                </p>
              </div>
            )}
          </div>
        )}

        {/* Totale tijd */}
        {phase !== 'IDLE' && (
          <div className="text-center opacity-60" style={{ color: '#94a3b8' }}>
            <p className="text-xs">TOTALE TIJD</p>
            <p className="text-lg font-bold">
              {Math.floor(elapsedSec / 60).toString().padStart(2, '0')}:{(elapsedSec % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 space-y-3">
        {phase === 'IDLE' && (
          <Button
            className="w-full h-16 text-xl font-bold rounded-2xl gap-3"
            style={{ background: MBT_GREEN }}
            onClick={handleStart}
          >
            <Play className="w-7 h-7" />
            Start sessie
          </Button>
        )}

        {phase === 'ACTIVE' && (
          <div className="flex gap-3">
            {hasIntervals && (
              <Button
                variant="outline"
                className="h-14 flex-shrink-0 rounded-xl gap-2"
                style={{ borderColor: '#ffffff40', background: '#ffffff10', color: '#fff' }}
                onClick={handleSkipInterval}
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            )}
            <Button
              className="h-14 flex-1 text-lg font-bold rounded-2xl gap-2"
              style={{ background: '#ffffff20', color: '#fff' }}
              onClick={handlePause}
            >
              <Pause className="w-6 h-6" />
              Pauzeer
            </Button>
            <Button
              variant="outline"
              className="h-14 px-5 rounded-xl"
              style={{ borderColor: '#ef444440', background: '#ef444420', color: '#ef4444' }}
              onClick={handleStop}
            >
              <Square className="w-5 h-5" />
            </Button>
          </div>
        )}

        {phase === 'PAUSED' && (
          <div className="flex gap-3">
            <Button
              className="h-14 flex-1 text-lg font-bold rounded-2xl gap-2"
              style={{ background: MBT_GREEN }}
              onClick={handleResume}
            >
              <Play className="w-6 h-6" />
              Hervat
            </Button>
            <Button
              variant="outline"
              className="h-14 px-5 rounded-xl border-destructive/30 text-destructive"
              onClick={handleStop}
            >
              <Square className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Hartslag invoer (altijd zichtbaar tijdens sessie) */}
        {(phase === 'ACTIVE' || phase === 'PAUSED') && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: '#ffffff10' }}
          >
            <Heart className="w-5 h-5 text-red-400" />
            <div className="flex-1">
              <p className="text-xs text-white/60">Hartslag (handmatig)</p>
              <p className="text-sm text-white/80">Doel: {HR_ZONES[session.targetZone].minPct}–{HR_ZONES[session.targetZone].maxPct}% HRmax</p>
            </div>
            <input
              type="number" min={40} max={220} placeholder="bpm"
              className="w-20 h-8 rounded-lg border bg-[#141A1B]/10 text-white text-center text-sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}
