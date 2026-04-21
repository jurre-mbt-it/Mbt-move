'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Play, Pause, Square, Heart, ChevronLeft,
  Volume2, VolumeX, SkipForward,
} from 'lucide-react'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, HR_ZONES, HRZone } from '@/lib/cardio-constants'
import { CARDIO_ICON_MAP, IconRunning, IconWalking, IconWarning, IconFinishFlag, IconCheck } from '@/components/icons'
import { P, Kicker, MetaLabel, Tile, DarkButton, DarkInput, CATEGORY_COLORS } from '@/components/dark-ui'

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

// HR zone colors — use CATEGORY_COLORS Z1-Z5
const ZONE_COLOR_MAP: Record<HRZone, string> = {
  1: CATEGORY_COLORS.Z1,
  2: CATEGORY_COLORS.Z2,
  3: CATEGORY_COLORS.Z3,
  4: CATEGORY_COLORS.Z4,
  5: CATEGORY_COLORS.Z5,
}

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
        <circle cx="100" cy="100" r={r} fill="none" stroke={P.surfaceHi} strokeWidth="12" />
        <circle
          cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="athletic-mono"
          style={{ color, fontSize: 48, fontWeight: 900, letterSpacing: '-0.02em' }}
        >
          {mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : secs}
        </span>
        <span
          className="athletic-mono mt-1"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}
        >
          {label}
        </span>
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
const SMILEY_COLORS = [P.danger, P.orange, P.gold, P.limeDeep, P.lime]

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
        <MetaLabel style={{ marginBottom: 8 }}>HOE VOELDE DE SESSIE?</MetaLabel>
        <div className="flex gap-2">
          {SMILEY_EXPRESSIONS.map((expr, i) => (
            <button
              key={i}
              onClick={() => setRpe(i + 1)}
              className="athletic-tap flex-1 flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
              style={
                rpe === i + 1
                  ? { borderColor: SMILEY_COLORS[i], background: SMILEY_COLORS[i] + '22', border: `2px solid ${SMILEY_COLORS[i]}` }
                  : { border: `2px solid ${P.line}`, background: P.surfaceHi }
              }
            >
              <SmileySVG expression={expr} color={SMILEY_COLORS[i]} />
              <span
                className="athletic-mono"
                style={{ color: rpe === i + 1 ? SMILEY_COLORS[i] : P.inkMuted, fontSize: 10, fontWeight: 700 }}
              >
                {SMILEY_LABELS[i]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <MetaLabel style={{ marginBottom: 8 }}>PIJN KNIE / ENKEL / VOET? (0-10)</MetaLabel>
        <div className="flex items-center gap-3">
          <input
            type="range" min={0} max={10} step={1}
            value={painLevel}
            onChange={e => setPainLevel(+e.target.value)}
            className="flex-1"
            style={{ accentColor: painLevel >= 5 ? P.danger : P.lime }}
          />
          <span
            className="athletic-mono w-8 text-center"
            style={{ color: painLevel >= 5 ? P.danger : P.lime, fontSize: 18, fontWeight: 900 }}
          >
            {painLevel}
          </span>
        </div>
        {highPain && (
          <div
            className="mt-2 p-2 rounded-lg flex gap-2"
            style={{ background: 'rgba(248,113,113,0.10)', border: `1px solid ${P.danger}33`, color: P.danger, fontSize: 11 }}
          >
            <IconWarning size={16} />
            <span>Pijn &gt; 5/10 — Volgende sessie wordt herhaald. Therapeut wordt op de hoogte gesteld.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <MetaLabel style={{ marginBottom: 6 }}>
            <span className="inline-flex items-center gap-1">
              <Heart className="w-3 h-3" style={{ color: P.danger }} /> GEM. HARTSLAG
            </span>
          </MetaLabel>
          <DarkInput
            type="number" min={60} max={220} placeholder="bijv. 145"
            value={hrInput}
            onChange={e => setHrInput(e.target.value)}
          />
        </div>
        <div>
          <MetaLabel style={{ marginBottom: 6 }}>AFSTAND (KM)</MetaLabel>
          <DarkInput
            type="number" min={0} step={0.1} placeholder="bijv. 2.4"
            value={distInput}
            onChange={e => setDistInput(e.target.value)}
          />
        </div>
      </div>

      <DarkButton
        size="lg"
        variant={highPain ? 'danger' : 'primary'}
        onClick={() => onSubmit({
          rpe: rpe * 2,
          painLevel,
          hrAvg: hrInput ? +hrInput : null,
          distance: distInput ? +distInput : null,
        })}
      >
        {highPain
          ? <span className="inline-flex items-center gap-1"><IconWarning size={16} /> SESSIE AFSLUITEN (PIJN GEMELD)</span>
          : <span className="inline-flex items-center gap-1"><IconCheck size={16} /> SESSIE AFSLUITEN</span>}
      </DarkButton>
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
  const zoneColor = ZONE_COLOR_MAP[session.targetZone]

  const elapsedMin = Math.floor(elapsedSec / 60)
  const elapsedSecs = elapsedSec % 60

  const isRun = currentInterval?.type === 'RUN'

  if (showFeedback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: P.bg, color: P.ink }}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="mb-3"><IconFinishFlag size={48} /></div>
            <Kicker>VOLTOOID</Kicker>
            <h2
              className="athletic-display"
              style={{
                color: P.ink,
                fontSize: 36,
                lineHeight: '40px',
                letterSpacing: '-0.03em',
                fontWeight: 900,
                paddingTop: 4,
                textTransform: 'uppercase',
              }}
            >
              SESSIE AF
            </h2>
            <MetaLabel style={{ marginTop: 6 }}>
              {elapsedMin}:{elapsedSecs.toString().padStart(2, '0')} ACTIEF · WEEK {session.week}, SESSIE {session.session}
            </MetaLabel>
          </div>
          <FeedbackModal onSubmit={handleFeedbackSubmit} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: P.bg, color: P.ink }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => router.back()}
          className="athletic-tap opacity-70 hover:opacity-100"
          style={{ color: P.ink }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center">
          <p
            className="athletic-mono flex items-center justify-center gap-1"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase' }}
          >
            {(() => { const Icon = CARDIO_ICON_MAP[session.activity]; return Icon ? <Icon size={14} /> : activityInfo.icon })()} {activityInfo.label}
          </p>
          <p
            className="athletic-mono mt-1"
            style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}
          >
            {protocolInfo.label} — Week {session.week}
          </p>
        </div>
        <button
          onClick={() => setSoundEnabled(s => !s)}
          className="athletic-tap opacity-70 hover:opacity-100"
          style={{ color: P.ink }}
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-8">

        {/* Zone badge */}
        <div
          className="px-4 py-1.5 rounded-full athletic-mono"
          style={{
            background: zoneColor + '22',
            color: zoneColor,
            border: `1px solid ${zoneColor}66`,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.08em',
          }}
        >
          {zoneInfo.label} ({zoneInfo.minPct}–{zoneInfo.maxPct}% HRmax)
        </div>

        {/* Circulaire timer / interval timer */}
        {hasIntervals && phase !== 'IDLE' ? (
          <div className="text-center">
            <CircularTimer
              seconds={intervalRemaining}
              total={currentInterval?.durationSec ?? 1}
              color={isRun ? P.lime : P.ice}
              label={currentInterval?.label ?? ''}
            />

            {/* Interval indicator */}
            <div className="mt-4">
              <p
                className="athletic-display"
                style={{ color: isRun ? P.lime : P.ice, fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em' }}
              >
                <span className="inline-flex items-center gap-2">
                  {isRun ? <><IconRunning size={28} /> LOPEN</> : <><IconWalking size={28} /> WANDELEN</>}
                </span>
              </p>
              <p
                className="athletic-mono mt-1"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
              >
                INTERVAL {currentIntervalIdx + 1} / {session.intervals.length}
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
                      ? (iv.type === 'RUN' ? P.lime + '88' : P.ice + '88')
                      : i === currentIntervalIdx
                        ? (iv.type === 'RUN' ? P.lime : P.ice)
                        : P.surfaceHi,
                    border: i === currentIntervalIdx ? `2px solid ${P.ink}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Elapsed timer voor non-interval */
          <div className="text-center">
            <div className="relative">
              <p
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 80, fontWeight: 900, letterSpacing: '-0.04em' }}
              >
                {elapsedMin.toString().padStart(2, '0')}:{elapsedSecs.toString().padStart(2, '0')}
              </p>
              <MetaLabel style={{ marginTop: 8 }}>
                VERSTREKEN · DOEL {session.targetDurationMin} MIN
              </MetaLabel>
            </div>

            {/* Voortgangsbalk */}
            {phase !== 'IDLE' && (
              <div className="w-64 mx-auto mt-4">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: P.surfaceHi }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ background: P.lime, width: `${Math.min((elapsedSec / (session.targetDurationMin * 60)) * 100, 100)}%` }}
                  />
                </div>
                <p
                  className="athletic-mono mt-1"
                  style={{ color: P.inkMuted, fontSize: 11 }}
                >
                  {Math.round((elapsedSec / (session.targetDurationMin * 60)) * 100)}% voltooid
                </p>
              </div>
            )}
          </div>
        )}

        {/* Totale tijd */}
        {phase !== 'IDLE' && (
          <div className="text-center">
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 }}
            >
              TOTALE TIJD
            </p>
            <p
              className="athletic-mono mt-1"
              style={{ color: P.ink, fontSize: 18, fontWeight: 900 }}
            >
              {Math.floor(elapsedSec / 60).toString().padStart(2, '0')}:{(elapsedSec % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 space-y-3">
        {phase === 'IDLE' && (
          <DarkButton size="lg" onClick={handleStart}>
            <Play className="w-6 h-6 mr-2" />
            START SESSIE
          </DarkButton>
        )}

        {phase === 'ACTIVE' && (
          <div className="flex gap-3">
            {hasIntervals && (
              <DarkButton
                variant="secondary"
                onClick={handleSkipInterval}
                className="flex-shrink-0"
              >
                <SkipForward className="w-5 h-5" />
              </DarkButton>
            )}
            <DarkButton
              variant="secondary"
              onClick={handlePause}
              className="flex-1"
              size="lg"
            >
              <Pause className="w-5 h-5 mr-2" />
              PAUZEER
            </DarkButton>
            <DarkButton variant="danger" onClick={handleStop}>
              <Square className="w-5 h-5" />
            </DarkButton>
          </div>
        )}

        {phase === 'PAUSED' && (
          <div className="flex gap-3">
            <DarkButton onClick={handleResume} size="lg" className="flex-1">
              <Play className="w-5 h-5 mr-2" />
              HERVAT
            </DarkButton>
            <DarkButton variant="danger" onClick={handleStop}>
              <Square className="w-5 h-5" />
            </DarkButton>
          </div>
        )}

        {/* Hartslag invoer (altijd zichtbaar tijdens sessie) */}
        {(phase === 'ACTIVE' || phase === 'PAUSED') && (
          <Tile style={{ padding: 12 }}>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5" style={{ color: P.danger }} />
              <div className="flex-1">
                <MetaLabel>HARTSLAG (HANDMATIG)</MetaLabel>
                <p
                  className="athletic-mono mt-1"
                  style={{ color: P.inkMuted, fontSize: 11 }}
                >
                  Doel: {HR_ZONES[session.targetZone].minPct}–{HR_ZONES[session.targetZone].maxPct}% HRmax
                </p>
              </div>
              <input
                type="number" min={40} max={220} placeholder="bpm"
                className="w-20 h-8 rounded-lg text-center athletic-mono outline-none"
                style={{
                  background: P.surfaceHi,
                  border: `1px solid ${P.lineStrong}`,
                  color: P.ink,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              />
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}
