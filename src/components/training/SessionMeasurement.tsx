'use client'

/**
 * De meetkant van één afgeronde training: strain, kerncijfers, hartslagcurve en
 * de verdeling over de zones.
 *
 * Waarom dit bestaat: dit beeld zat alleen in de iOS-app. Wie de training in de
 * browser opende — als sporter, of als therapeut op de iPad in de praktijk —
 * zag alleen de oefeningen, en dus niet de helft van wat er gemeten was. De
 * server stuurde die velden al mee; alleen het web deed er niets mee.
 *
 * De vorm volgt bewust `components/training-detail.tsx` uit de mobiele repo:
 * een boog voor de strain (géén balk — dit is geen stand ten opzichte van een
 * doelbereik maar een antwoord op "hoe zwaar was dit?"), daaronder de cijfers,
 * dan de curve met de zoneverdeling. Het rekenwerk komt uit
 * `src/lib/hr-series-view.ts`, dat de app meeleest via `npm run check:mirror`.
 */
import { P } from '@/lib/palette'
import { Kicker, MetaLabel } from '@/components/dark-ui'
import { HR_ZONES, type HRZone } from '@/lib/cardio-constants'
import {
  computeDecoupling,
  fmtDuration,
  readZones,
  ZONE_COLOR,
  type Decoupling,
  type SeriesPoint,
  type ZoneKey,
  type Zones,
} from '@/lib/hr-series-view'

export type Measurement = {
  avgHeartRate: number | null
  maxHeartRate: number | null
  durationSec: number
  calories: number | null
  timeInZones: unknown
  series: unknown
  source: string
  startAt?: string
}

export type Strain = {
  score: number | null
  dayScore: number | null
  estimated: boolean
}

const SOURCE_LABEL: Record<string, string> = {
  STRAVA: 'Strava',
  APPLE_WATCH: 'Apple Watch',
  OURA: 'Oura',
  POLAR: 'Polar',
  MANUAL: 'handmatige invoer',
}

const ZONE_NAME: Record<ZoneKey, string> = {
  '0': 'Onder zone 1',
  '1': 'Herstel',
  '2': 'Aerobe basis',
  '3': 'Tempo',
  '4': 'Drempel',
  '5': 'VO₂max',
}

const DECOUPLING_META: Record<Decoupling['band'], { label: string; color: string }> = {
  good: { label: 'STERK GEKOPPELD', color: P.lime },
  moderate: { label: 'LICHTE DRIFT', color: P.gold },
  high: { label: 'ONTKOPPELD', color: P.brand },
}

/** Bron van een meting; onbekende bron levert géén label in plaats van een verkeerde. */
export function measurementSourceLabel(source: string | null | undefined): string | null {
  return source ? (SOURCE_LABEL[source] ?? null) : null
}

/** `timeInZones` komt als Json uit Prisma; alleen een object met getallen is bruikbaar. */
function asZoneRecord(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, number>
}

function asSeries(v: unknown): SeriesPoint[] {
  return Array.isArray(v) ? (v as SeriesPoint[]) : []
}

// ── Strain-boog ──────────────────────────────────────────────────────────────

/**
 * De vier banden van de schaal, in één lijst zodat de boog en de uitleg niet
 * uit elkaar kunnen lopen. Spiegelt STRAIN_BANDS in components/strain-arc.tsx
 * van de app.
 */
const STRAIN_BANDS = [
  { van: 0, tot: 3, kleur: P.ice },
  { van: 3, tot: 6, kleur: P.lime },
  { van: 6, tot: 8, kleur: P.gold },
  { van: 8, tot: 10.01, kleur: P.danger },
]

function strainColor(score10: number): string {
  return STRAIN_BANDS.find(b => score10 < b.tot)?.kleur ?? P.danger
}

const ARC_SIZE = 96
const ARC_STROKE = 8
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE) / 2 - 2
/** Driekwart cirkel; het open kwart onderin draagt geen waarde. */
const ARC_SWEEP = 0.75

function StrainArc({ score10, label }: { score10: number | null; label: string }) {
  const c = 2 * Math.PI * ARC_RADIUS
  const boog = c * ARC_SWEEP
  const v = score10 == null ? 0 : Math.max(0, Math.min(10, score10))
  const kleur = score10 == null ? P.lineStrong : strainColor(v)
  return (
    <div className="flex items-center gap-4">
      <svg width={ARC_SIZE} height={ARC_SIZE} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`} aria-hidden>
        <g transform={`rotate(135 ${ARC_SIZE / 2} ${ARC_SIZE / 2})`}>
          <circle
            cx={ARC_SIZE / 2} cy={ARC_SIZE / 2} r={ARC_RADIUS}
            fill="none" stroke={P.track} strokeWidth={ARC_STROKE} strokeLinecap="round"
            strokeDasharray={`${boog} ${c}`}
          />
          {score10 != null && (
            <circle
              cx={ARC_SIZE / 2} cy={ARC_SIZE / 2} r={ARC_RADIUS}
              fill="none" stroke={kleur} strokeWidth={ARC_STROKE} strokeLinecap="round"
              strokeDasharray={`${(boog * v) / 10} ${c}`}
            />
          )}
        </g>
        <text
          x={ARC_SIZE / 2} y={ARC_SIZE / 2 + 7} textAnchor="middle"
          className="athletic-mono" fill={P.ink} fontSize={22} fontWeight={800}
        >
          {score10 == null ? '—' : score10.toFixed(1).replace('.', ',')}
        </text>
      </svg>
      <div className="min-w-0">
        <Kicker>{label}</Kicker>
      </div>
    </div>
  )
}

// ── Hartslagcurve ────────────────────────────────────────────────────────────

/**
 * Hartslag (bpm) over de sessie. Zelfde opzet als de app: vaste hoogte, drie
 * hulplijnen, gevulde vlak onder de lijn. Bewust losse SVG en geen recharts —
 * dit is één statische lijn zonder interactie, en dan is een grafiekbibliotheek
 * alleen maar een extra manier waarop de twee schermen kunnen gaan verschillen.
 */
function HrChart({ series }: { series: SeriesPoint[] }) {
  const pts = series.filter((p): p is { t: number; hr: number; spd: number | null } => p.hr != null)
  if (pts.length < 2) return null
  const width = 640
  const h = 150
  const padL = 34
  const padR = 10
  const padT = 12
  const padB = 20
  const ts = pts.map(p => p.t)
  const hrs = pts.map(p => p.hr)
  const tMin = Math.min(...ts)
  const tMax = Math.max(...ts)
  const yLo = Math.floor((Math.min(...hrs) - 5) / 5) * 5
  const yHi = Math.ceil((Math.max(...hrs) + 5) / 5) * 5
  const span = Math.max(1, yHi - yLo)
  const x = (t: number) => padL + (tMax === tMin ? 0.5 : (t - tMin) / (tMax - tMin)) * (width - padL - padR)
  const y = (v: number) => padT + (1 - (v - yLo) / span) * (h - padT - padB)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.hr).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts[pts.length - 1].t).toFixed(1)} ${h - padB} L${x(pts[0].t).toFixed(1)} ${h - padB} Z`
  const gridVals = [yHi, (yHi + yLo) / 2, yLo]
  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: h }}
      role="img"
      aria-label="Hartslag tijdens de training"
    >
      <defs>
        <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.danger} stopOpacity={0.28} />
          <stop offset="1" stopColor={P.danger} stopOpacity={0} />
        </linearGradient>
      </defs>
      {gridVals.map((v, i) => (
        <line key={`g${i}`} x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke={P.line} strokeWidth={1} />
      ))}
      {gridVals.map((v, i) => (
        <text key={`t${i}`} x={padL - 6} y={y(v) + 3} fill={P.inkDim} fontSize={9} textAnchor="end" className="athletic-mono">
          {Math.round(v)}
        </text>
      ))}
      <path d={area} fill="url(#hrFill)" />
      <path d={line} stroke={P.danger} strokeWidth={6} strokeOpacity={0.25} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line} stroke={P.danger} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x={padL} y={h - 5} fill={P.inkDim} fontSize={9} className="athletic-mono">0&apos;</text>
      <text x={width - padR} y={h - 5} fill={P.inkDim} fontSize={9} textAnchor="end" className="athletic-mono">
        {Math.round(tMax / 60)}&apos;
      </text>
    </svg>
  )
}

/** Uitsplitsing van de tijd per hartslagzone: nummer, naam, balk en tijd. */
function ZoneBreakdown({ zones }: { zones: Zones }) {
  return (
    <div className="flex flex-col gap-2.5">
      {zones.entries.map(e => {
        const pct = (e.sec / zones.total) * 100
        const min = Math.round(e.sec / 60)
        return (
          <div key={e.zone} className="flex items-center gap-2">
            <span className="athletic-mono" style={{ width: 24, fontSize: 12, fontWeight: 900, color: ZONE_COLOR[e.zone] }}>
              {e.zone === '0' ? '·' : `Z${e.zone}`}
            </span>
            <span className="truncate" style={{ width: 92, fontSize: 11, color: P.inkDim }}>
              {ZONE_NAME[e.zone]}
            </span>
            <span className="flex-1 rounded" style={{ height: 8, background: P.track, overflow: 'hidden' }}>
              <span
                className="block h-full rounded"
                // Nul blijft nul: een minimumbreedte zou een zone waarin je niets
                // deed er toch als iets uit laten zien.
                style={{ width: `${pct === 0 ? 0 : Math.max(2, pct)}%`, background: ZONE_COLOR[e.zone] }}
              />
            </span>
            <span className="athletic-mono text-right" style={{ width: 44, fontSize: 11, fontWeight: 700, color: P.inkMuted }}>
              {min < 60 ? `${min}m` : `${Math.floor(min / 60)}u${String(min % 60).padStart(2, '0')}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <p className="athletic-mono" style={{ fontSize: 16, color: P.ink }}>{value}</p>
      <MetaLabel style={{ fontSize: 9, color: P.inkDim, marginTop: 2 }}>{label}</MetaLabel>
    </div>
  )
}

// ── Het blok zelf ────────────────────────────────────────────────────────────

export function SessionMeasurement({
  measurement,
  strain,
  durationSec,
  exertionLevel,
  painLevel,
}: {
  measurement: Measurement | null
  strain: Strain | null
  /** Duur uit de app; ontbreekt die, dan valt hij terug op de gemeten duur. */
  durationSec: number | null
  exertionLevel: number | null
  painLevel: number | null
}) {
  const duur = durationSec ?? measurement?.durationSec ?? null
  const bron = measurementSourceLabel(measurement?.source)

  // Geen strain én geen meting: dan valt hier niets te tonen en zou een lege
  // boog alleen maar suggereren dat er iets kapot is.
  if (strain?.score == null && !measurement) return null

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-2xl"
        style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, padding: '14px 16px' }}
      >
        <StrainArc
          score10={strain?.score != null ? strain.score / 10 : null}
          label={strain?.estimated ? 'SESSION STRAIN · GESCHAT' : 'SESSION STRAIN'}
        />
        <div
          className="flex gap-3 mt-3 pt-3"
          style={{ borderTop: `1px solid ${P.line}` }}
        >
          {duur != null && <Stat label="TIJD" value={fmtDuration(duur)} />}
          {exertionLevel != null && <Stat label="RPE" value={String(exertionLevel)} />}
          {measurement?.avgHeartRate != null && <Stat label="GEM. HR" value={String(measurement.avgHeartRate)} />}
          {measurement?.maxHeartRate != null && <Stat label="MAX" value={String(measurement.maxHeartRate)} />}
          {measurement?.avgHeartRate == null && painLevel != null && (
            <Stat label="PIJN" value={String(painLevel)} />
          )}
        </div>
        {bron && (
          <MetaLabel style={{ color: P.inkDim, fontSize: 9, marginTop: 10 }}>
            GEMETEN MET {bron.toUpperCase()}
          </MetaLabel>
        )}
      </div>

      <SessionHeartRate measurement={measurement} />
    </div>
  )
}

/**
 * Alleen de hartslagsectie: curve, zoneverdeling en ontkoppeling. Los
 * bruikbaar voor cardio, waar de kerncijfers al in een eigen raster staan en
 * een tweede strain-boog niets toevoegt.
 */
export function SessionHeartRate({ measurement }: { measurement: Measurement | null }) {
  const series = asSeries(measurement?.series)
  const hasCurve = series.filter(p => p.hr != null).length >= 2
  const zones = readZones(asZoneRecord(measurement?.timeInZones))
  const decoupling = computeDecoupling(series)
  if (!hasCurve && !zones) return null
  return (
    <div>
      <Kicker style={{ marginBottom: 8 }}>HARTSLAG</Kicker>
      {hasCurve && <HrChart series={series} />}
      {zones && (
        <div className="mt-3">
          <ZoneBreakdown zones={zones} />
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 10 }}>
            De meeste tijd in zone {zones.top.zone}, {ZONE_NAME[zones.top.zone].toLowerCase()}.
          </p>
        </div>
      )}
      {decoupling && (
        <p style={{ color: DECOUPLING_META[decoupling.band].color, fontSize: 12, lineHeight: '18px', marginTop: 8 }}>
          {DECOUPLING_META[decoupling.band].label} · {decoupling.pct}% ontkoppeling
        </p>
      )}
    </div>
  )
}

/** Alleen de zone-uitsplitsing, voor schermen die de curve al elders tonen. */
export function SessionZones({ timeInZones }: { timeInZones: unknown }) {
  const zones = readZones(asZoneRecord(timeInZones))
  if (!zones) return null
  return <ZoneBreakdown zones={zones} />
}

/** Zonekleur voor losse chips elders; blijft zo bij HR_ZONES in de pas. */
export function zoneColor(zone: HRZone): string {
  return HR_ZONES[zone].color
}
