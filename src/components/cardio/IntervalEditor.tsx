'use client'

/**
 * Herbruikbare interval-editor voor cardio — gedeeld tussen het voorschrijven
 * (therapeut) en het zelf loggen (atleet). Een interval-blok is een herhaalbare
 * werk/rust-combinatie met optionele doel-HR-zone.
 */

import { Plus, Trash2 } from 'lucide-react'
import { P, MetaLabel } from '@/components/dark-ui'
import { HR_ZONES, type HRZone } from '@/lib/cardio-constants'

export interface IntervalBlock {
  label?: string
  workSec: number
  restSec: number
  repetitions: number
  targetZone?: HRZone | null
}

export function emptyInterval(): IntervalBlock {
  return { label: '', workSec: 60, restSec: 30, repetitions: 4, targetZone: null }
}

/** Totale duur (sec) van een lijst interval-blokken (werk + rust × herhalingen). */
export function intervalsTotalSec(blocks: IntervalBlock[]): number {
  return blocks.reduce((sum, b) => sum + Math.max(1, b.repetitions) * (b.workSec + b.restSec), 0)
}

const numInput: React.CSSProperties = {
  background: P.surfaceHi,
  border: `1px solid ${P.lineStrong}`,
  color: P.ink,
  fontSize: 13,
  fontWeight: 800,
  borderRadius: 8,
  height: 36,
  width: '100%',
  textAlign: 'center',
  outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <MetaLabel style={{ marginBottom: 4 }}>{label}</MetaLabel>
      {children}
    </div>
  )
}

export function IntervalEditor({
  blocks,
  onChange,
}: {
  blocks: IntervalBlock[]
  onChange: (next: IntervalBlock[]) => void
}) {
  const update = (i: number, patch: Partial<IntervalBlock>) => {
    onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))
  const add = () => onChange([...blocks, emptyInterval()])

  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div
          key={i}
          className="rounded-xl p-3 space-y-3"
          style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
        >
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              placeholder={`Blok ${i + 1} (bijv. "400m hard")`}
              value={b.label ?? ''}
              onChange={(e) => update(i, { label: e.target.value })}
              style={{ ...numInput, textAlign: 'left', flex: 1, paddingLeft: 10 }}
            />
            <button
              onClick={() => remove(i)}
              className="athletic-tap shrink-0 rounded-lg flex items-center justify-center"
              style={{ width: 36, height: 36, background: P.surfaceLow, color: P.danger, border: `1px solid ${P.line}` }}
              aria-label="Verwijder blok"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <Field label="WERK (SEC)">
              <input
                type="number" min={0} step={5} value={b.workSec}
                onChange={(e) => update(i, { workSec: Math.max(0, +e.target.value) })}
                style={numInput}
              />
            </Field>
            <Field label="RUST (SEC)">
              <input
                type="number" min={0} step={5} value={b.restSec}
                onChange={(e) => update(i, { restSec: Math.max(0, +e.target.value) })}
                style={numInput}
              />
            </Field>
            <Field label="HERHALINGEN">
              <input
                type="number" min={1} step={1} value={b.repetitions}
                onChange={(e) => update(i, { repetitions: Math.max(1, +e.target.value) })}
                style={numInput}
              />
            </Field>
          </div>

          <Field label="DOEL-ZONE">
            <div className="flex gap-1.5">
              {([1, 2, 3, 4, 5] as HRZone[]).map((z) => {
                const active = b.targetZone === z
                return (
                  <button
                    key={z}
                    onClick={() => update(i, { targetZone: active ? null : z })}
                    className="athletic-tap flex-1 rounded-lg"
                    style={{
                      height: 32,
                      fontSize: 12,
                      fontWeight: 900,
                      color: active ? P.bg : HR_ZONES[z].color,
                      background: active ? HR_ZONES[z].color : P.control,
                      border: `1px solid ${active ? HR_ZONES[z].color : P.line}`,
                    }}
                  >
                    Z{z}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      ))}

      <button
        onClick={add}
        className="athletic-tap w-full rounded-xl flex items-center justify-center gap-2"
        style={{
          height: 44,
          background: P.control,
          border: `1px dashed ${P.lineStrong}`,
          color: P.ink,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.1em',
        }}
      >
        <Plus className="w-4 h-4" /> INTERVAL TOEVOEGEN
      </button>
    </div>
  )
}
