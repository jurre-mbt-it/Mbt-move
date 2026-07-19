'use client'

/**
 * Compacte belasting-status voor het start-behandeling scherm. Geeft de
 * therapeut in één oogopslag of de patiënt veilig belast is (vorm-zone +
 * advies), met een kracht/cardio-onderverdeling. Tikbaar → volle belasting-
 * curve in het patiëntdossier (Voortgang).
 *
 * Betrouwbaarheid: de fitness-fatigue-uitslag is pas zinvol als de chronische
 * basis (28d EWMA) grotendeels gevuld is. Onder de drempel tonen we een
 * neutrale "beeld in opbouw"-staat i.p.v. een (mogelijk vals) kleur-oordeel.
 *
 * Rechtsboven staat de week-op-week %-sprong (spike-indicator, vervangt de
 * ACWR); daaronder een consistentie-streak als positief opbouw-signaal.
 */

import Link from 'next/link'
import { P, MetaLabel } from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import type { LoadPoint, LoadStatusKey } from '@/lib/training-load'

const STATUS_COLORS: Record<LoadStatusKey, string> = {
  overreaching: P.danger,
  productief: P.lime,
  neutraal: P.inkMuted,
  fris: P.ice,
  ontraind: P.gold,
}

// De betrouwbaarheids-drempel komt centraal van de server (calibration op de
// loadCurve): 7 dagen historie + 3 sessies, dezelfde gate als in de iOS-app.

export function PatientLoadStrip({ patientId }: { patientId: string }) {
  const { data, isLoading } = trpc.patients.loadCurve.useQuery(
    { patientId, days: 56 },
    { staleTime: 60_000 },
  )

  if (isLoading) {
    return (
      <div
        className="rounded-xl"
        style={{ height: 78, background: P.surface, border: `1px solid ${P.lineStrong}`, opacity: 0.5 }}
        aria-hidden
      />
    )
  }

  // Niets gelogd → geen tegel, houd het start-scherm rustig.
  if (!data || data.sessionCount === 0) return null

  const cal = data.calibration
  const reliable = cal.status === 'ready'

  const href = `/therapist/patients/${patientId}/progress`

  // ── IJkperiode: neutraal, geen kleur-oordeel ───────────────────────────
  if (!reliable) {
    const dag = Math.min(cal.daysLogged + 1, cal.daysNeeded)
    return (
      <Link href={href} className="block athletic-tap">
        <div
          className="rounded-xl"
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, padding: '11px 13px' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ width: 9, height: 9, borderRadius: 999, background: P.inkDim, flexShrink: 0 }} />
            <div>
              <MetaLabel>Belasting</MetaLabel>
              <div style={{ color: P.inkMuted, fontSize: 14, fontWeight: 700, marginTop: 1 }}>
                IJkperiode loopt
              </div>
            </div>
          </div>
          <p style={{ color: P.inkDim, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>
            Dag {dag} van {cal.daysNeeded}, {Math.min(cal.sessionsLogged, cal.sessionsNeeded)} van{' '}
            {cal.sessionsNeeded} trainingen gelogd. Zodra dat vol is bepalen we het startniveau en
            tonen we de belasting-zone.
          </p>
        </div>
      </Link>
    )
  }

  // ── Volledig beeld ─────────────────────────────────────────────────────
  const color = STATUS_COLORS[data.status.key]
  const today = data.today
  // Week-op-week vervangt de ACWR als spike-indicator: kale % sprong t.o.v. de
  // 3 weken ervoor. Boven ~+50% kleuren we 'm als "let op de opbouw".
  const wk = data.weekChange
  const SPIKE = 50
  const wkColor = wk !== null && wk > SPIKE ? P.gold : P.ink
  const streak = data.consistency.streakWeeks

  return (
    <Link href={href} className="block athletic-tap">
      <div
        className="rounded-xl"
        style={{ background: `${color}14`, border: `1px solid ${color}66`, padding: '12px 13px' }}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />
            <div className="min-w-0">
              <MetaLabel>Belasting</MetaLabel>
              <div style={{ color, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 1 }}>
                {data.status.label}
              </div>
            </div>
          </div>
          {wk !== null && (
            <div className="text-right" style={{ flexShrink: 0 }}>
              <MetaLabel>Week-op-week</MetaLabel>
              <div style={{ color: wkColor, fontSize: 15, fontWeight: 700, marginTop: 1 }}>
                {signed(wk)}%
              </div>
            </div>
          )}
        </div>

        <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>
          {data.status.description}
          {wk !== null && wk > SPIKE
            ? ' De belasting sprong deze week fors omhoog — bouw de komende dagen rustiger op.'
            : streak >= 3
              ? ` ${streak} weken op rij consistent getraind — mooie basis.`
              : ''}
        </p>

        <div className="flex items-center justify-between gap-3" style={{ marginTop: 9 }}>
          <Sparkline points={data.points} color={color} />
          <div
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em', textAlign: 'right' }}
          >
            VORM <span style={{ color }}>{signed(today?.form ?? 0)}</span>
            {' · '}FIT {Math.round(today?.fitness ?? 0)}
            {' · '}VERM {Math.round(today?.fatigue ?? 0)}
            {streak > 0 ? <>{' · '}STREAK {streak}w</> : null}
          </div>
        </div>

        {/* Kracht / cardio onderverdeling */}
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 9 }}>
          {data.strength && data.strength.sessionCount > 0 && (
            <ModalityChip label="Kracht" status={data.strength.status} />
          )}
          {data.cardio && data.cardio.sessionCount > 0 && (
            <ModalityChip
              label="Cardio"
              status={data.cardio.status}
              extra={data.cardio.trimp !== null ? `TRIMP ${data.cardio.trimp}` : undefined}
            />
          )}
        </div>
      </div>
    </Link>
  )
}

function ModalityChip({
  label,
  status,
  extra,
}: {
  label: string
  status: { key: LoadStatusKey; label: string }
  extra?: string
}) {
  const c = STATUS_COLORS[status.key]
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c, flexShrink: 0 }} />
      <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em', fontWeight: 800 }}>
        {label.toUpperCase()}
      </span>
      <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>{status.label}</span>
      {extra && (
        <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.04em' }}>
          · {extra}
        </span>
      )}
    </span>
  )
}

/** Mini vorm-trend (laatste ~6 weken). Puur indicatief, geen assen. */
function Sparkline({ points, color }: { points: LoadPoint[]; color: string }) {
  const W = 120
  const H = 22
  const slice = points.slice(-42)
  if (slice.length < 2) return <div style={{ width: W, height: H }} aria-hidden />

  const forms = slice.map((p) => p.form)
  const min = Math.min(...forms, 0)
  const max = Math.max(...forms, 0)
  const span = max - min || 1
  const x = (i: number) => (i / (slice.length - 1)) * W
  const y = (v: number) => H - ((v - min) / span) * H
  const path = slice.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.form).toFixed(1)}`).join(' ')
  const zeroY = y(0)
  const last = slice[slice.length - 1]

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }} aria-hidden>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={P.lineStrong} strokeWidth={1} strokeDasharray="2 3" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={y(last.form)} r={2.4} fill={color} />
    </svg>
  )
}

function signed(v: number): string {
  const r = Math.round(v)
  return r > 0 ? `+${r}` : String(r)
}
