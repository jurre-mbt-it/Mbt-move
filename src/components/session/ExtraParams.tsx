'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { P, DarkInput, DarkSelect } from '@/components/dark-ui'
import { STANDARD_PARAMS, REP_UNITS } from '@/lib/program-constants'
import type { SessionParam } from '@/lib/session-sets'

const mono =
  'var(--font-mono-athletic)'

// Oplopende teller voor param-ids — puur genoeg voor de react-hooks-linter;
// uniek binnen de sessie is voldoende (ids zijn alleen list-keys).
let paramSeq = 0

/**
 * Eenheid-keuze voor de reps-kolom (reps / sec / min / m) — alleen op
 * atleet-eigen oefeningen; programma-oefeningen volgen de therapeut.
 */
export function RepUnitPicker({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full p-0.5"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
      role="group"
      aria-label="Eenheid"
    >
      {REP_UNITS.map(u => {
        const active = value === u.value
        return (
          <button
            key={u.value}
            type="button"
            onClick={() => onChange(u.value)}
            aria-pressed={active}
            className="athletic-tap rounded-full"
            style={{
              padding: '3px 9px',
              fontFamily: mono,
              fontSize: 9,
              letterSpacing: '0.1em',
              fontWeight: 800,
              textTransform: 'uppercase',
              background: active ? P.surfaceHi : 'transparent',
              border: `1px solid ${active ? 'rgba(245,185,66,0.5)' : 'transparent'}`,
              color: active ? P.gold : P.inkMuted,
            }}
          >
            {u.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Extra parameters tijdens de sessie (Tempo, RPE, Band kleur, …).
 * `addable` bepaalt of de gebruiker zelf parameters mag toevoegen/verwijderen:
 * atleet wél; patiënt alleen invullen wat de therapeut heeft ingesteld.
 */
export function ExtraParamsEditor({
  params,
  onChange,
  addable,
}: {
  params: SessionParam[]
  onChange: (next: SessionParam[]) => void
  addable: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const available = STANDARD_PARAMS.filter(t => !params.some(p => p.label === t.label))

  function setValue(id: string, value: string | number) {
    onChange(params.map(p => (p.id === id ? { ...p, value } : p)))
  }

  function remove(id: string) {
    onChange(params.filter(p => p.id !== id))
  }

  function add(tpl: (typeof STANDARD_PARAMS)[number]) {
    const t = tpl as (typeof STANDARD_PARAMS)[number] & { min?: number; max?: number; options?: string[]; unit?: string }
    onChange([
      ...params,
      {
        id: `p-${tpl.label}-${++paramSeq}`,
        label: tpl.label,
        type: tpl.type,
        value: tpl.type === 'number' || tpl.type === 'slider' ? 0 : '',
        unit: t.unit || undefined,
        options: t.options,
        min: t.min,
        max: t.max,
      },
    ])
    setPickerOpen(false)
  }

  if (params.length === 0 && !addable) return null

  return (
    <div className="space-y-1.5">
      {params.map(p => (
        <div
          key={p.id}
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
        >
          <span
            className="athletic-mono shrink-0 truncate"
            style={{ width: 88, color: P.inkMuted, fontSize: 9, letterSpacing: '0.1em', fontWeight: 800, textTransform: 'uppercase' }}
          >
            {p.label}
          </span>
          {p.type === 'select' && p.options ? (
            <DarkSelect
              value={String(p.value)}
              onChange={(ev) => setValue(p.id, ev.target.value)}
              aria-label={p.label}
              className="flex-1 min-w-0"
              style={{ padding: '7px 10px', fontSize: 14 }}
            >
              <option value="">—</option>
              {p.options.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </DarkSelect>
          ) : (
            <DarkInput
              value={String(p.value === 0 && (p.type === 'number' || p.type === 'slider') ? '' : p.value)}
              onChange={(ev) => {
                const raw = ev.target.value
                if (p.type === 'number' || p.type === 'slider') {
                  const cleaned = raw.replace(/[^0-9.,]/g, '')
                  const n = Number(cleaned.replace(',', '.'))
                  setValue(p.id, cleaned === '' ? 0 : Number.isFinite(n) ? n : 0)
                } else {
                  setValue(p.id, raw)
                }
              }}
              inputMode={p.type === 'number' || p.type === 'slider' ? 'decimal' : undefined}
              placeholder={'placeholder' in p && typeof (p as { placeholder?: string }).placeholder === 'string' ? (p as { placeholder?: string }).placeholder : undefined}
              aria-label={p.label}
              className="flex-1 min-w-0"
              style={{ padding: '7px 10px', fontSize: 14 }}
            />
          )}
          {p.unit && (
            <span className="athletic-mono shrink-0" style={{ color: P.inkDim, fontSize: 10 }}>
              {p.unit}
            </span>
          )}
          {addable && (
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label={`Verwijder ${p.label}`}
              className="athletic-tap shrink-0"
              style={{ color: P.inkDim, padding: 4 }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {addable && (
        pickerOpen ? (
          <div
            className="rounded-xl p-2 flex flex-wrap gap-1.5"
            style={{ background: P.surfaceLow, border: `1px dashed ${P.lineStrong}` }}
          >
            {available.length === 0 ? (
              <span style={{ color: P.inkDim, fontSize: 11, padding: '2px 4px' }}>
                Alle parameters staan er al op.
              </span>
            ) : (
              available.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => add(t)}
                  className="athletic-tap athletic-mono rounded-full"
                  style={{
                    padding: '5px 11px',
                    border: `1px solid ${P.lineStrong}`,
                    color: P.ink,
                    background: P.surfaceHi,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    fontWeight: 800,
                  }}
                >
                  + {t.label.toUpperCase()}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Sluiten"
              className="athletic-tap ml-auto"
              style={{ color: P.inkDim, padding: 4 }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="athletic-tap w-full flex items-center justify-center gap-1.5 rounded-xl"
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
            PARAMETER TOEVOEGEN
          </button>
        )
      )}
    </div>
  )
}
