'use client'

import { Check, Plus } from 'lucide-react'
import { P, DarkInput } from '@/components/dark-ui'
import {
  type SetEntry,
  type LastLog,
  prevKgFor,
  prevRepsFor,
} from '@/lib/session-sets'
import { isPerSideUnit } from '@/lib/program-constants'

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

/**
 * Set-rijen — de gedeelde log-UI van de sessie-runners (atleet, quick workout,
 * patiënt). Per set een rij met kg/reps-invoer en een afvink-knop; de vorige
 * sessie staat als ghost-waarde in lege velden. Kleurtaal uit het design:
 * lime = klaar, goud = actieve set, gedimd = nog niet aan de beurt.
 */
export function SetRows({
  entries,
  last,
  repUnit,
  onUpdate,
  onToggle,
  onAdd,
}: {
  entries: SetEntry[]
  last?: LastLog
  repUnit: string
  onUpdate: (idx: number, patch: Partial<SetEntry>) => void
  onToggle: (idx: number) => void
  onAdd: () => void
}) {
  const activeIdx = entries.findIndex(s => !s.done)
  const perSide = isPerSideUnit(repUnit)

  return (
    <div>
      {/* Kolomkoppen */}
      <div className="flex items-center gap-2 px-3">
        <span style={{ width: 26 }} />
        <span className="flex-1 athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em' }}>
          KG
        </span>
        <span className="flex-1 athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em' }}>
          {perSide ? 'REPS/ZIJDE' : repUnit === 'reps' ? 'REPS' : repUnit.toUpperCase()}
        </span>
        <span style={{ width: 44 }} />
      </div>
      {perSide && (
        <p className="px-3 mt-1 athletic-mono" style={{ color: P.gold, fontSize: 9, letterSpacing: '0.08em' }}>
          PER ZIJDE · ÉÉN VINKJE TELT LINKS + RECHTS
        </p>
      )}

      <div className="space-y-1.5 mt-1.5">
        {entries.map((s, i) => {
          const pk = prevKgFor(last, i)
          const pr = prevRepsFor(last, i)
          const isActive = i === activeIdx
          const isUpcoming = !s.done && !isActive && s.kg === ''
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all"
              style={{
                background: s.done
                  ? 'rgba(190,242,100,0.06)'
                  : isActive
                    ? P.surfaceHi
                    : P.surfaceLow,
                border: `1px solid ${
                  s.done
                    ? 'rgba(190,242,100,0.35)'
                    : isActive
                      ? 'rgba(244,194,97,0.5)'
                      : P.line
                }`,
                boxShadow: isActive ? '0 0 0 1px rgba(244,194,97,0.2)' : undefined,
                opacity: isUpcoming ? 0.55 : 1,
              }}
            >
              <span
                className="athletic-mono shrink-0"
                style={{
                  width: 26,
                  color: s.done ? P.lime : isActive ? P.gold : P.inkMuted,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                }}
              >
                S{i + 1}
              </span>
              <DarkInput
                value={s.kg}
                onChange={(ev) => onUpdate(i, { kg: ev.target.value.replace(/[^0-9.,]/g, '') })}
                inputMode="decimal"
                placeholder={pk != null && pk > 0 ? String(pk).replace('.', ',') : undefined}
                aria-label={`Gewicht set ${i + 1} (kg)`}
                className="flex-1 min-w-0"
                style={{ padding: '8px 10px', fontSize: 16 }}
              />
              <DarkInput
                value={s.reps}
                onChange={(ev) => onUpdate(i, { reps: ev.target.value.replace(/[^0-9]/g, '') })}
                inputMode="numeric"
                placeholder={pr != null ? String(pr) : undefined}
                aria-label={`Reps set ${i + 1}`}
                className="flex-1 min-w-0"
                style={{ padding: '8px 10px', fontSize: 16 }}
              />
              <button
                type="button"
                onClick={() => onToggle(i)}
                aria-label={s.done ? `Set ${i + 1} heropenen` : `Set ${i + 1} klaar`}
                aria-pressed={s.done}
                className="athletic-tap shrink-0 rounded-xl flex items-center justify-center transition-all"
                style={{
                  width: 44,
                  height: 40,
                  background: s.done ? P.lime : 'transparent',
                  border: `1.5px solid ${s.done ? P.lime : isActive ? 'rgba(244,194,97,0.6)' : P.lineStrong}`,
                  color: s.done ? P.bg : isActive ? P.gold : P.inkDim,
                }}
              >
                <Check className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="athletic-tap mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl"
        style={{
          padding: '9px 12px',
          border: `1px dashed ${P.lineStrong}`,
          color: P.inkMuted,
          background: 'transparent',
          fontFamily: mono,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.14em',
        }}
      >
        <Plus className="w-3 h-3" />
        SET TOEVOEGEN
      </button>
    </div>
  )
}
