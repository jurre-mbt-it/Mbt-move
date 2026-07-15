'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Heart } from 'lucide-react'
import {
  P, Kicker, MetaLabel, Tile, DarkButton,
} from '@/components/dark-ui'
import {
  SELECTABLE_CARDIO_ACTIVITIES,
  CARDIO_ACTIVITIES,
  CARDIO_PROTOCOLS,
  type CardioActivityKey,
  type CardioProtocolKey,
} from '@/lib/cardio-constants'
import { CARDIO_ICON_MAP } from '@/components/icons'
import {
  computeHrZones, bpmToZone, formatPace,
} from '@/lib/cardio-zones'
import {
  IntervalEditor, intervalsTotalSec, emptyInterval, type IntervalBlock,
} from '@/components/cardio/IntervalEditor'
import { trpc } from '@/lib/trpc/client'
import { PlannedCardioCard } from '@/components/cardio/PlannedCardioCard'
import { readWorkout, totalDurationSec as workoutDuration } from '@/lib/cardio-workout'

const SELECTABLE_PROTOCOLS: CardioProtocolKey[] = [
  'STEADY_STATE', 'INTERVALS', 'TEMPO', 'ZONE_TRAINING', 'THRESHOLD', 'LONG_SLOW_DISTANCE',
]

// Lokale YYYY-MM-DD (geen UTC-shift) voor de datum-input.
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

const numInputStyle: React.CSSProperties = {
  background: P.surfaceHi,
  border: `1px solid ${P.lineStrong}`,
  color: P.ink,
  fontSize: 16,
  fontWeight: 800,
  borderRadius: 10,
  height: 48,
  width: '100%',
  textAlign: 'center',
  outline: 'none',
}

export default function AthleteCardioLogPage() {
  // useSearchParams vereist een Suspense-grens bij prerenderen.
  return (
    <Suspense fallback={null}>
      <AthleteCardioLogPageInner />
    </Suspense>
  )
}

function AthleteCardioLogPageInner() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.getMe.useQuery()
  const logCardio = trpc.patient.logCardioSession.useMutation()

  // ?itemId=… → dit is een geplande cardio-workout. Tot nu toe was dit scherm
  // volledig handinvoer: wat de therapeut voorschreef kwam hier nooit aan.
  const searchParams = useSearchParams()
  const plannedItemId = searchParams.get('itemId')
  const { data: planned } = trpc.patient.getTodayExercises.useQuery(
    plannedItemId ? { itemId: plannedItemId } : undefined,
    { enabled: !!plannedItemId },
  )
  const plannedWorkout = useMemo(
    () => readWorkout(planned?.plannedItem?.cardio ?? null),
    [planned],
  )

  const [activity, setActivity] = useState<CardioActivityKey>('RUNNING')
  const [protocol, setProtocol] = useState<CardioProtocolKey>('STEADY_STATE')
  const [useIntervals, setUseIntervals] = useState(false)
  const [blocks, setBlocks] = useState<IntervalBlock[]>([emptyInterval()])

  const todayStr = ymd(new Date())
  const [dateStr, setDateStr] = useState(todayStr)

  const [durMin, setDurMin] = useState('')
  const [durSec, setDurSec] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [rpe, setRpe] = useState(5)
  const [pain, setPain] = useState(0)
  const [notes, setNotes] = useState('')

  // Voorvullen uit het voorschrift, éénmalig: activiteit en de geplande duur.
  // Alleen als de atleet nog niets zelf heeft ingevuld, anders overschrijven we
  // zijn invoer zodra de query binnenkomt.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (prefilled || !plannedWorkout) return
    setActivity(plannedWorkout.activity)
    const sec = workoutDuration(plannedWorkout.blocks)
    if (sec > 0) {
      setDurMin(String(Math.floor(sec / 60)))
      setDurSec(String(sec % 60))
    }
    if (plannedWorkout.blocks.some(b => b.kind === 'REPEAT')) setProtocol('INTERVALS')
    setPrefilled(true)
  }, [plannedWorkout, prefilled])

  const intervalsOn = useIntervals || protocol === 'INTERVALS'

  // Totale duur: handmatig óf afgeleid uit de intervallen.
  const durationSec = useMemo(() => {
    if (intervalsOn && blocks.length > 0) return intervalsTotalSec(blocks)
    return (Math.max(0, parseInt(durMin || '0', 10)) * 60) + Math.max(0, parseInt(durSec || '0', 10))
  }, [intervalsOn, blocks, durMin, durSec])

  const distanceM = distanceKm ? Math.round(parseFloat(distanceKm) * 1000) : null
  const paceLabel = formatPace(activity, distanceM, durationSec)

  const zones = me ? computeHrZones(me) : null
  const avgHrNum = avgHr ? parseInt(avgHr, 10) : null
  const achievedZone = avgHrNum && me ? bpmToZone(avgHrNum, me) : null

  const canSave = durationSec > 0 && !logCardio.isPending

  async function handleSave() {
    if (durationSec <= 0) {
      toast.error('Vul een trainingsduur of intervallen in.')
      return
    }
    const timeInZones = achievedZone ? { [String(achievedZone)]: durationSec } : undefined
    const intervalsPayload = intervalsOn
      ? blocks.flatMap((b) =>
          Array.from({ length: Math.max(1, b.repetitions) }, () => ({
            label: b.label || 'Werk',
            type: 'WORK',
            durationSec: b.workSec,
          })).concat(
            b.restSec > 0
              ? [{ label: 'Rust', type: 'REST', durationSec: b.restSec }]
              : [],
          ),
        )
      : undefined
    // Combineer de gekozen dag met de huidige kloktijd: vandaag ≈ nu, een
    // eerdere dag krijgt die datum op het huidige tijdstip (sorteert netjes).
    const now = new Date()
    const [yy, mm, dd] = dateStr.split('-').map(Number)
    const completedAt = new Date(yy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
    try {
      await logCardio.mutateAsync({
        programId: null,
        // Vinkt exact deze geplande workout af i.p.v. "er is die dag cardio
        // gelogd".
        weekScheduleDayItemId: plannedItemId,
        activity,
        protocol,
        durationSec,
        distanceM,
        avgHeartRate: avgHrNum,
        maxHeartRate: maxHr ? parseInt(maxHr, 10) : null,
        zone: achievedZone,
        rpe,
        painLevel: pain,
        notes: notes.trim() || null,
        intervals: intervalsPayload,
        timeInZones,
        completedAt,
      })
      await Promise.all([
        utils.patient.getSessionHistory.invalidate(),
        utils.patient.getRecoverySessions.invalidate(),
      ])
      toast.success('Cardio-sessie opgeslagen!')
      router.push('/athlete/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-28 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="athletic-tap" style={{ color: P.ink }}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <Kicker>CARDIO LOGGEN</Kicker>
            <h1
              className="athletic-display"
              style={{ color: P.ink, fontSize: 'clamp(32px, 9vw, 52px)', fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}
            >
              NIEUWE SESSIE
            </h1>
          </div>
        </div>

        {/* Het voorschrift van de therapeut — alleen als dit een geplande
            workout is. Read-only: hieronder log je wat je écht deed. */}
        {plannedWorkout && <PlannedCardioCard workout={plannedWorkout} />}

        {/* Wanneer — standaard vandaag, maar achteraf loggen kan ook */}
        <Tile>
          <Kicker style={{ marginBottom: 10 }}>WANNEER</Kicker>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: 'Vandaag', value: todayStr },
              { label: 'Gisteren', value: ymd(addDays(new Date(), -1)) },
              { label: 'Eergisteren', value: ymd(addDays(new Date(), -2)) },
            ].map((opt) => {
              const active = dateStr === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setDateStr(opt.value)}
                  className="athletic-tap rounded-full px-3 py-2"
                  style={{
                    background: active ? P.brand + '22' : P.surfaceHi,
                    border: `1px solid ${active ? P.brand : P.line}`,
                    color: active ? P.brand : P.inkMuted,
                    fontSize: 12, fontWeight: 800,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <MetaLabel style={{ marginBottom: 4 }}>OF KIES EEN DATUM</MetaLabel>
          <input
            type="date"
            value={dateStr}
            max={todayStr}
            onChange={(e) => { if (e.target.value) setDateStr(e.target.value) }}
            style={{ ...numInputStyle, textAlign: 'left', padding: '0 12px', colorScheme: 'dark' }}
          />
          {dateStr !== todayStr && (
            <MetaLabel style={{ marginTop: 8, textTransform: 'none', fontWeight: 500, color: P.gold }}>
              Je logt deze sessie op{' '}
              {new Date(`${dateStr}T00:00:00`).toLocaleDateString('nl-NL', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
              .
            </MetaLabel>
          )}
        </Tile>

        {/* Activiteit */}
        <Tile>
          <Kicker style={{ marginBottom: 10 }}>ACTIVITEIT</Kicker>
          <div className="grid grid-cols-5 gap-2">
            {SELECTABLE_CARDIO_ACTIVITIES.map((key) => {
              const info = CARDIO_ACTIVITIES[key]
              const active = activity === key
              return (
                <button
                  key={key}
                  onClick={() => setActivity(key)}
                  className="athletic-tap flex flex-col items-center gap-1 rounded-xl py-2.5"
                  style={{
                    background: active ? P.brand + '22' : P.surfaceHi,
                    border: `2px solid ${active ? P.brand : P.line}`,
                  }}
                >
                  <span style={{ color: active ? P.brand : P.ink }}>{(() => { const Icon = CARDIO_ICON_MAP[key]; return Icon ? <Icon size={22} /> : info.icon })()}</span>
                  <span className="athletic-mono" style={{ fontSize: 9, fontWeight: 800, color: active ? P.brand : P.inkMuted, letterSpacing: '0.04em' }}>
                    {info.label}
                  </span>
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Protocol */}
        <Tile>
          <Kicker style={{ marginBottom: 10 }}>TYPE TRAINING</Kicker>
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_PROTOCOLS.map((key) => {
              const info = CARDIO_PROTOCOLS[key]
              const active = protocol === key
              return (
                <button
                  key={key}
                  onClick={() => setProtocol(key)}
                  className="athletic-tap rounded-full px-3 py-2"
                  style={{
                    background: active ? info.color + '22' : P.surfaceHi,
                    border: `1px solid ${active ? info.color : P.line}`,
                    color: active ? info.color : P.inkMuted,
                    fontSize: 12, fontWeight: 800,
                  }}
                >
                  {info.label}
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Intervallen */}
        <Tile>
          <div className="flex items-center justify-between mb-3">
            <Kicker>INTERVALLEN</Kicker>
            <button
              onClick={() => setUseIntervals((v) => !v)}
              className="athletic-tap rounded-full px-3 py-1.5"
              style={{
                background: intervalsOn ? P.brand : P.surfaceHi,
                color: intervalsOn ? P.bg : P.inkMuted,
                border: `1px solid ${intervalsOn ? P.brand : P.line}`,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                opacity: protocol === 'INTERVALS' ? 0.6 : 1,
              }}
              disabled={protocol === 'INTERVALS'}
            >
              {intervalsOn ? 'AAN' : 'UIT'}
            </button>
          </div>
          {intervalsOn ? (
            <>
              <IntervalEditor blocks={blocks} onChange={setBlocks} />
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${P.line}` }}>
                <MetaLabel>
                  TOTAAL: {Math.floor(durationSec / 60)} MIN {durationSec % 60}S
                </MetaLabel>
              </div>
            </>
          ) : (
            <MetaLabel>Zet aan voor blok-/intervaltraining (werk · rust · herhalingen).</MetaLabel>
          )}
        </Tile>

        {/* Resultaat */}
        <Tile>
          <Kicker style={{ marginBottom: 10 }}>RESULTAAT</Kicker>

          {!intervalsOn && (
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <MetaLabel style={{ marginBottom: 4 }}>MINUTEN</MetaLabel>
                <input type="number" min={0} placeholder="30" value={durMin} onChange={(e) => setDurMin(e.target.value)} style={numInputStyle} />
              </div>
              <div className="flex-1">
                <MetaLabel style={{ marginBottom: 4 }}>SECONDEN</MetaLabel>
                <input type="number" min={0} max={59} placeholder="00" value={durSec} onChange={(e) => setDurSec(e.target.value)} style={numInputStyle} />
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <MetaLabel style={{ marginBottom: 4 }}>AFSTAND (KM)</MetaLabel>
              <input type="number" min={0} step={0.1} placeholder="5.0" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} style={numInputStyle} />
            </div>
            <div className="flex-1">
              <MetaLabel style={{ marginBottom: 4 }}>TEMPO</MetaLabel>
              <div className="flex items-center justify-center athletic-mono" style={{ ...numInputStyle, color: paceLabel ? P.lime : P.inkDim }}>
                {paceLabel ?? '—'}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <MetaLabel style={{ marginBottom: 4 }}>
                <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" style={{ color: P.danger }} /> GEM. HR</span>
              </MetaLabel>
              <input type="number" min={40} max={220} placeholder="bpm" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} style={numInputStyle} />
            </div>
            <div className="flex-1">
              <MetaLabel style={{ marginBottom: 4 }}>MAX HR</MetaLabel>
              <input type="number" min={40} max={230} placeholder="bpm" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} style={numInputStyle} />
            </div>
          </div>

          {achievedZone && (
            <div className="mt-2">
              <MetaLabel>GEMIDDELD IN ZONE {achievedZone}</MetaLabel>
            </div>
          )}
        </Tile>

        {/* HR-zones */}
        <Tile>
          <div className="flex items-center justify-between mb-3">
            <Kicker>JOUW HARTSLAGZONES</Kicker>
            <Link href="/athlete/profile" style={{ fontSize: 11, fontWeight: 800, color: P.brand, textDecoration: 'none', letterSpacing: '0.06em' }}>
              PROFIEL →
            </Link>
          </div>
          {zones ? (
            <div className="space-y-1.5">
              {zones.zones.map((z) => (
                <div key={z.zone} className="flex items-center gap-3">
                  <span className="rounded-md athletic-mono text-center" style={{ width: 28, color: P.bg, background: z.color, fontSize: 11, fontWeight: 900, padding: '2px 0' }}>
                    Z{z.zone}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: P.inkMuted }}>{z.label}</span>
                  <span className="athletic-mono" style={{ fontSize: 12, fontWeight: 800, color: z.color }}>
                    {z.minBpm}–{z.maxBpm}
                  </span>
                </div>
              ))}
              <p style={{ fontSize: 10, color: P.inkDim, marginTop: 6 }}>
                Methode: {zones.method === 'KARVONEN' ? 'Karvonen (rust-HR)' : zones.method === 'PCT_HRMAX' ? '% max-HR' : 'geschat op leeftijd'}
              </p>
            </div>
          ) : (
            <MetaLabel>Vul je max-hartslag of geboortedatum in je profiel in om je zones te zien.</MetaLabel>
          )}
        </Tile>

        {/* RPE + pijn */}
        <Tile>
          <MetaLabel style={{ marginBottom: 8 }}>RPE — HOE ZWAAR? ({rpe}/10)</MetaLabel>
          <input type="range" min={1} max={10} step={1} value={rpe} onChange={(e) => setRpe(+e.target.value)} className="w-full" style={{ accentColor: P.brand }} />

          <MetaLabel style={{ marginTop: 14, marginBottom: 8 }}>PIJN (0-10) ({pain})</MetaLabel>
          <input type="range" min={0} max={10} step={1} value={pain} onChange={(e) => setPain(+e.target.value)} className="w-full" style={{ accentColor: pain >= 5 ? P.danger : P.lime }} />

          <MetaLabel style={{ marginTop: 14, marginBottom: 8 }}>NOTITIES</MetaLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hoe ging het? Ondergrond, gevoel, weer…"
            rows={3}
            style={{ ...numInputStyle, height: 'auto', textAlign: 'left', padding: 10, fontSize: 13, fontWeight: 500, resize: 'vertical' }}
          />
        </Tile>

        <DarkButton size="lg" onClick={handleSave} disabled={!canSave} loading={logCardio.isPending}>
          SESSIE OPSLAAN →
        </DarkButton>
      </div>
    </div>
  )
}
