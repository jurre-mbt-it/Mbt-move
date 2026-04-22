'use client'

import { useState } from 'react'
import type { MuscleRecoveryState } from '@/lib/recovery-estimation'
import { getRecoveryColor, getRecoveryLabel, formatHoursRemaining } from '@/lib/recovery-estimation'
import { P, MetaLabel } from '@/components/dark-ui'

interface Props {
  recoveryStates: MuscleRecoveryState[]
}

// ── Muscle group → SVG region mapping ────────────────────────────────────────
// Each muscle maps to one or more path definitions for front/back view
// Coordinates are for a 200×400 viewBox

type MuscleRegion = {
  view: 'front' | 'back'
  path: string
}

const MUSCLE_PATHS: Record<string, MuscleRegion[]> = {
  // ── FRONT VIEW ──
  'Borst': [{
    view: 'front',
    path: 'M70,110 Q80,100 100,98 Q120,100 130,110 L128,135 Q100,140 72,135 Z',
  }],
  'Schouders anterieur': [
    { view: 'front', path: 'M58,100 Q62,92 70,95 L72,112 Q64,115 58,110 Z' },
    { view: 'front', path: 'M130,95 Q138,92 142,100 L142,110 Q136,115 128,112 Z' },
  ],
  'Schouders lateraal': [
    { view: 'front', path: 'M52,98 Q56,90 62,92 L58,112 Q52,108 50,102 Z' },
    { view: 'front', path: 'M138,92 Q144,90 148,98 L150,102 Q148,108 142,112 Z' },
  ],
  'Biceps': [
    { view: 'front', path: 'M55,115 Q58,112 64,115 L62,155 Q56,158 52,152 Z' },
    { view: 'front', path: 'M136,115 Q142,112 145,115 L148,152 Q144,158 138,155 Z' },
  ],
  'Onderarmen': [
    { view: 'front', path: 'M48,158 Q54,155 60,158 L56,195 Q50,198 46,192 Z' },
    { view: 'front', path: 'M140,158 Q146,155 152,158 L154,192 Q150,198 144,195 Z' },
  ],
  'Core': [{
    view: 'front',
    path: 'M80,138 Q100,142 120,138 L118,195 Q100,200 82,195 Z',
  }],
  'Hip flexors': [
    { view: 'front', path: 'M82,195 Q90,192 95,198 L93,215 Q86,218 80,210 Z' },
    { view: 'front', path: 'M105,198 Q110,192 118,195 L120,210 Q114,218 107,215 Z' },
  ],
  'Quadriceps': [
    { view: 'front', path: 'M78,215 Q86,210 95,218 L93,290 Q84,295 76,285 Z' },
    { view: 'front', path: 'M105,218 Q114,210 122,215 L124,285 Q116,295 107,290 Z' },
  ],
  'Adductoren': [
    { view: 'front', path: 'M93,220 Q100,218 107,220 L105,265 Q100,268 95,265 Z' },
  ],
  'Calves': [
    { view: 'front', path: 'M78,300 Q85,295 92,300 L90,350 Q84,355 76,348 Z' },
    { view: 'front', path: 'M108,300 Q115,295 122,300 L124,348 Q116,355 110,350 Z' },
  ],

  // ── BACK VIEW ──
  'Bovenrug': [{
    view: 'back',
    path: 'M75,105 Q100,100 125,105 L123,130 Q100,135 77,130 Z',
  }],
  'Lats': [
    { view: 'back', path: 'M70,120 Q75,115 80,120 L78,155 Q72,160 68,150 Z' },
    { view: 'back', path: 'M120,120 Q125,115 130,120 L132,150 Q128,160 122,155 Z' },
  ],
  'Schouders posterieur': [
    { view: 'back', path: 'M55,98 Q60,92 68,96 L66,112 Q58,115 53,108 Z' },
    { view: 'back', path: 'M132,96 Q140,92 145,98 L147,108 Q142,115 134,112 Z' },
  ],
  'Rotatorcuff': [
    { view: 'back', path: 'M62,96 Q68,93 73,98 L72,108 Q66,110 60,104 Z' },
    { view: 'back', path: 'M127,98 Q132,93 138,96 L140,104 Q134,110 128,108 Z' },
  ],
  'Triceps': [
    { view: 'back', path: 'M50,115 Q56,112 62,116 L58,155 Q52,158 48,150 Z' },
    { view: 'back', path: 'M138,116 Q144,112 150,115 L152,150 Q148,158 142,155 Z' },
  ],
  'Onderrug': [{
    view: 'back',
    path: 'M82,135 Q100,138 118,135 L116,175 Q100,180 84,175 Z',
  }],
  'Glutes': [
    { view: 'back', path: 'M78,180 Q90,175 100,180 L98,210 Q88,215 76,208 Z' },
    { view: 'back', path: 'M100,180 Q110,175 122,180 L124,208 Q112,215 102,210 Z' },
  ],
  'Hamstrings': [
    { view: 'back', path: 'M76,215 Q86,210 94,218 L92,290 Q84,295 74,285 Z' },
    { view: 'back', path: 'M106,218 Q114,210 124,215 L126,285 Q116,295 108,290 Z' },
  ],
  'Abductoren': [
    { view: 'back', path: 'M72,210 Q78,205 82,212 L80,245 Q74,248 70,240 Z' },
    { view: 'back', path: 'M118,212 Q122,205 128,210 L130,240 Q126,248 120,245 Z' },
  ],
}

// Body silhouette outlines
const BODY_FRONT_OUTLINE = `
  M100,18
  Q88,18 82,30 Q78,40 80,52 Q78,60 72,68 Q66,72 58,78 Q50,84 48,92
  Q46,100 50,108 L48,115 Q44,120 42,130 Q38,145 40,160 Q42,170 44,180
  L46,195 Q48,200 46,210
  M100,18
  Q112,18 118,30 Q122,40 120,52 Q122,60 128,68 Q134,72 142,78 Q150,84 152,92
  Q154,100 150,108 L152,115 Q156,120 158,130 Q162,145 160,160 Q158,170 156,180
  L154,195 Q152,200 154,210
  M80,195 Q82,188 85,195 L84,200 Q96,205 100,205 Q104,205 116,200 L115,195 Q118,188 120,195
  L124,260 Q126,290 124,310 Q122,330 120,350 Q118,365 116,375
  L108,378 Q104,370 100,375 Q96,370 92,378
  L84,375 Q82,365 80,350 Q78,330 76,310 Q74,290 76,260 Z
`

const BODY_BACK_OUTLINE = BODY_FRONT_OUTLINE

function BodySilhouette({ view }: { view: 'front' | 'back' }) {
  return (
    <path
      d={view === 'front' ? BODY_FRONT_OUTLINE : BODY_BACK_OUTLINE}
      fill={P.surfaceHi}
      stroke={P.lineStrong}
      strokeWidth="1"
    />
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function BodyFigure({ recoveryStates }: Props) {
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'front' | 'back'>('front')

  const recoveryMap = new Map<string, MuscleRecoveryState>()
  for (const state of recoveryStates) {
    recoveryMap.set(state.muscle, state)
  }

  const hoveredState = hoveredMuscle ? recoveryMap.get(hoveredMuscle) : null

  function renderMuscleRegions(view: 'front' | 'back') {
    return Object.entries(MUSCLE_PATHS)
      .flatMap(([muscle, regions]) =>
        regions
          .filter(r => r.view === view)
          .map((region, i) => {
            const state = recoveryMap.get(muscle)
            const color = state
              ? getRecoveryColor(state.recoveryPercent)
              : 'rgba(255,255,255,0.06)'
            const isHovered = hoveredMuscle === muscle

            return (
              <path
                key={`${muscle}-${i}`}
                d={region.path}
                fill={color}
                fillOpacity={state ? (isHovered ? 0.95 : 0.8) : 0.4}
                stroke={isHovered ? P.ink : 'rgba(255,255,255,0.08)'}
                strokeWidth={isHovered ? 1.5 : 0.5}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredMuscle(muscle)}
                onMouseLeave={() => setHoveredMuscle(null)}
                onTouchStart={() => setHoveredMuscle(muscle)}
              />
            )
          })
      )
  }

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div
        className="inline-flex items-center gap-1 rounded-xl p-1 mx-auto"
        style={{
          backgroundColor: P.surfaceLow,
          border: `1px solid ${P.line}`,
          display: 'flex',
          width: 'fit-content',
          marginInline: 'auto',
        }}
      >
        <ViewToggle active={activeView === 'front'} onClick={() => setActiveView('front')}>
          VOORKANT
        </ViewToggle>
        <ViewToggle active={activeView === 'back'} onClick={() => setActiveView('back')}>
          ACHTERKANT
        </ViewToggle>
      </div>

      {/* SVG body figure */}
      <div className="flex justify-center">
        <svg
          viewBox="30 10 140 380"
          className="w-full max-w-[200px] h-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Head */}
          <circle cx="100" cy="25" r="14" fill={P.surfaceHi} stroke={P.lineStrong} strokeWidth="1" />

          {/* Neck */}
          <rect
            x="94"
            y="39"
            width="12"
            height="12"
            rx="3"
            fill={P.surfaceHi}
            stroke={P.lineStrong}
            strokeWidth="0.5"
          />

          {/* Body silhouette */}
          <BodySilhouette view={activeView} />

          {/* Muscle regions */}
          {renderMuscleRegions(activeView)}
        </svg>
      </div>

      {/* Tooltip / info */}
      {hoveredState ? (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{
            backgroundColor: P.surfaceLow,
            border: `1px solid ${getRecoveryColor(hoveredState.recoveryPercent)}55`,
          }}
        >
          <div className="flex items-center justify-between">
            <span
              style={{
                color: P.ink,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.01em',
                textTransform: 'uppercase',
              }}
            >
              {hoveredState.muscle}
            </span>
            <span
              className="athletic-mono rounded-full px-2.5 py-0.5"
              style={{
                color: P.bg,
                background: getRecoveryColor(hoveredState.recoveryPercent),
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {getRecoveryLabel(hoveredState.recoveryPercent)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <TooltipStat value={`${hoveredState.recoveryPercent}%`} label="HERSTEL" />
            <TooltipStat
              value={formatHoursRemaining(hoveredState.hoursRemaining)}
              label="RESTEREND"
            />
            <TooltipStat value={`${hoveredState.totalRecoveryHours}u`} label="TOTAAL" />
          </div>
        </div>
      ) : (
        <p
          className="athletic-mono text-center"
          style={{
            color: P.inkMuted,
            fontSize: 10,
            letterSpacing: '0.12em',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          TIK OP EEN SPIERGROEP VOOR DETAILS
        </p>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-4">
        <LegendItem color={P.lime} label="HERSTELD" />
        <LegendItem color={P.gold} label="HERSTELLEND" />
        <LegendItem color={P.danger} label="BELAST" />
      </div>
    </div>
  )
}

function ViewToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-mono athletic-tap rounded-lg px-4 py-1.5 transition-colors"
      style={{
        backgroundColor: active ? P.lime : 'transparent',
        color: active ? P.bg : P.inkMuted,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: '0.14em',
      }}
    >
      {children}
    </button>
  )
}

function TooltipStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div
        className="athletic-display"
        style={{
          color: P.ink,
          fontSize: 18,
          lineHeight: '22px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9, marginTop: 2 }}>{label}</MetaLabel>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }}
      />
      <span
        className="athletic-mono"
        style={{
          color: P.inkMuted,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
        }}
      >
        {label}
      </span>
    </span>
  )
}
