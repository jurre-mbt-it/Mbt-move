'use client'

/**
 * Slaap-tegel: hypnogram van de laatste nacht + transparante kwaliteitsscore +
 * stage-breakdown, en daaronder een meerdaagse stapel-grafiek (stages per
 * nacht) plus consistentie. Stage-percentages zijn ruis op één nacht maar
 * betrouwbaar als trend — vandaar altijd de meerdaagse context erbij.
 */
import { useMemo } from 'react'
import { Tile, Kicker, MetaLabel, P } from '@/components/dark-ui'
import { sleepBand, sleepConsistency, type SleepStage } from '@/lib/sleep-metrics'

const STAGE_COLOR: Record<Exclude<SleepStage, 'inBed'>, string> = {
  deep: P.lime,
  rem: P.purple,
  light: P.ice,
  awake: P.gold,
}
const STAGE_LABEL: Record<Exclude<SleepStage, 'inBed'>, string> = {
  deep: 'Diep', rem: 'REM', light: 'Licht', awake: 'Wakker',
}
// Hypnogram-rij-volgorde (boven → onder).
const ROW_ORDER: Array<Exclude<SleepStage, 'inBed'>> = ['awake', 'rem', 'light', 'deep']

type Segment = { stage: SleepStage; startAt: string; endAt: string }

export type SleepNightDto = {
  date: string
  startAt: string
  endAt: string
  asleepMin: number
  lightMin: number
  deepMin: number
  remMin: number
  awakeMin: number
  inBedMin: number | null
  efficiency: number | null
  latencyMin: number | null
  qualityScore: number | null
  stages?: unknown
}

export function SleepCard({ sleep }: { sleep: SleepNightDto[] }) {
  const nights = useMemo(
    () => [...sleep].sort((a, b) => a.date.localeCompare(b.date)),
    [sleep],
  )
  const last = nights[nights.length - 1] ?? null
  const consistency = useMemo(
    () => sleepConsistency(nights.slice(-7).map(n => ({ startAt: n.startAt, endAt: n.endAt }))),
    [nights],
  )

  if (!last) {
    return (
      <Tile>
        <Kicker>SLAAP</Kicker>
        <div className="py-6 text-center">
          <MetaLabel style={{ color: P.inkMuted }}>NOG GEEN SLAAPDATA</MetaLabel>
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6 }}>
            Draag je Apple Watch ’s nachts om je slaap te volgen.
          </p>
        </div>
      </Tile>
    )
  }

  const q = last.qualityScore ?? 0
  const band = sleepBand(q)
  const bandColor = band.key === 'good' ? P.lime : band.key === 'fair' ? P.gold : P.danger
  const segments = (Array.isArray(last.stages) ? last.stages : []) as Segment[]

  return (
    <Tile accentBar={bandColor}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Kicker style={{ color: bandColor }}>SLAAP</Kicker>
          <div className="flex items-baseline gap-2" style={{ paddingTop: 4 }}>
            <span
              className="athletic-display"
              style={{ color: P.ink, fontSize: 30, lineHeight: '32px', letterSpacing: '-0.03em', fontWeight: 900 }}
            >
              {formatDuration(last.asleepMin)}
            </span>
            <span style={{ color: P.inkMuted, fontSize: 12, fontWeight: 700 }}>
              {band.label.toLowerCase()}
            </span>
          </div>
          <MetaLabel style={{ marginTop: 4 }}>KWALITEIT {q}/100 · {bedtimeRange(last)}</MetaLabel>
        </div>
        <QualityRing score={q} color={bandColor} />
      </div>

      {/* Hypnogram laatste nacht */}
      {segments.length > 0 && <Hypnogram segments={segments} />}

      {/* Stage-breakdown */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <StageStat stage="deep" min={last.deepMin} total={last.asleepMin} />
        <StageStat stage="rem" min={last.remMin} total={last.asleepMin} />
        <StageStat stage="light" min={last.lightMin} total={last.asleepMin} />
        <StageStat stage="awake" min={last.awakeMin} total={last.asleepMin} />
      </div>

      {/* Meerdaagse stapel-grafiek */}
      {nights.length >= 3 && (
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${P.line}` }}>
          <MetaLabel style={{ color: P.inkMuted, marginBottom: 8 }}>
            LAATSTE {Math.min(nights.length, 14)} NACHTEN
          </MetaLabel>
          <NightBars nights={nights.slice(-14)} />
        </div>
      )}

      {/* Onderbalk: consistentie / efficiëntie / latentie */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${P.line}` }}>
        <MiniStat label="CONSISTENTIE" value={consistency != null ? `${consistency}` : '—'} unit={consistency != null ? '/100' : ''} tint={P.ice} />
        <MiniStat label="EFFICIËNTIE" value={last.efficiency != null ? `${Math.round(last.efficiency * 100)}` : '—'} unit="%" tint={P.lime} />
        <MiniStat label="INSLAPEN" value={last.latencyMin != null ? `${last.latencyMin}` : '—'} unit="min" tint={P.gold} />
      </div>
    </Tile>
  )
}

function Hypnogram({ segments }: { segments: Segment[] }) {
  const stageSegs = segments.filter(s => s.stage !== 'inBed')
  if (!stageSegs.length) return null
  const t0 = Math.min(...stageSegs.map(s => new Date(s.startAt).getTime()))
  const t1 = Math.max(...stageSegs.map(s => new Date(s.endAt).getTime()))
  const span = Math.max(1, t1 - t0)

  const H = 76
  const rowH = 13
  const gap = (H - rowH * ROW_ORDER.length) / (ROW_ORDER.length - 1)
  const rowY = (stage: Exclude<SleepStage, 'inBed'>) => ROW_ORDER.indexOf(stage) * (rowH + gap)

  return (
    <div className="mt-3">
      <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
        {ROW_ORDER.map(stage => (
          <line
            key={`g-${stage}`}
            x1={0} x2={100} y1={rowY(stage) + rowH / 2} y2={rowY(stage) + rowH / 2}
            stroke={P.line} strokeWidth={0.5} vectorEffect="non-scaling-stroke"
          />
        ))}
        {stageSegs.map((s, i) => {
          const stage = s.stage as Exclude<SleepStage, 'inBed'>
          const x = ((new Date(s.startAt).getTime() - t0) / span) * 100
          const w = Math.max(0.4, ((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / span) * 100)
          return (
            <rect
              key={i} x={x} y={rowY(stage)} width={w} height={rowH} rx={1.5}
              fill={STAGE_COLOR[stage]} opacity={0.92}
            />
          )
        })}
      </svg>
      <div className="flex justify-between mt-1">
        <MetaLabel style={{ color: P.inkDim, fontSize: 9 }}>{clockOf(stageSegs[0].startAt)}</MetaLabel>
        <MetaLabel style={{ color: P.inkDim, fontSize: 9 }}>{clockOf(stageSegs[stageSegs.length - 1].endAt)}</MetaLabel>
      </div>
    </div>
  )
}

function NightBars({ nights }: { nights: SleepNightDto[] }) {
  const maxMin = Math.max(...nights.map(n => n.asleepMin + n.awakeMin), 480)
  const H = 80
  return (
    <div className="flex items-end gap-[3px]" style={{ height: H }}>
      {nights.map(n => {
        const total = n.asleepMin + n.awakeMin
        const h = (total / maxMin) * H
        // Stapel van onder→boven: diep, REM, licht, wakker.
        const parts: Array<[Exclude<SleepStage, 'inBed'>, number]> = [
          ['deep', n.deepMin], ['rem', n.remMin], ['light', n.lightMin], ['awake', n.awakeMin],
        ]
        return (
          <div key={n.date} className="flex-1 flex flex-col justify-end" title={`${n.date} · ${formatDuration(n.asleepMin)}`}>
            <div className="w-full rounded-[2px] overflow-hidden flex flex-col-reverse" style={{ height: h }}>
              {parts.map(([stage, min]) => (
                <div key={stage} style={{ height: `${(min / total) * 100}%`, backgroundColor: STAGE_COLOR[stage] }} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StageStat({ stage, min, total }: { stage: Exclude<SleepStage, 'inBed'>; min: number; total: number }) {
  const pct = total > 0 ? Math.round((min / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1 rounded-lg" style={{ backgroundColor: P.surfaceLow, padding: '8px 9px' }}>
      <div className="flex items-center gap-1.5">
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: STAGE_COLOR[stage] }} />
        <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>{STAGE_LABEL[stage]}</MetaLabel>
      </div>
      <span className="athletic-mono" style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}>
        {formatDuration(min)}
      </span>
      <MetaLabel style={{ color: P.inkDim, fontSize: 9 }}>{pct}%</MetaLabel>
    </div>
  )
}

function MiniStat({ label, value, unit, tint }: { label: string; value: string; unit: string; tint: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-baseline gap-0.5">
        <span className="athletic-display" style={{ color: tint, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>{value}</span>
        {unit && <span style={{ color: P.inkDim, fontSize: 10 }}>{unit}</span>}
      </div>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>{label}</MetaLabel>
    </div>
  )
}

function QualityRing({ score, color }: { score: number; color: string }) {
  const R = 28
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.max(0, Math.min(100, score)) / 100)
  return (
    <div className="relative shrink-0" style={{ width: 70, height: 70 }}>
      <svg width={70} height={70} viewBox="0 0 70 70" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={35} cy={35} r={R} fill="none" stroke={P.surfaceHi} strokeWidth={6} />
        <circle
          cx={35} cy={35} r={R} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="athletic-display" style={{ color, fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>{score}</span>
      </div>
    </div>
  )
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}u ${String(m).padStart(2, '0')}m`
}
function clockOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function bedtimeRange(n: SleepNightDto): string {
  return `${clockOf(n.startAt)}–${clockOf(n.endAt)}`
}
