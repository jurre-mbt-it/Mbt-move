'use client'

/**
 * De bloklijst van een training als compacte rijen: in de dagcel van de
 * planner en, iets ruimer, in het zijpaneel. Soorticoon in de soortkleur,
 * naam, voorschrift in mono. Warming-up en cooldown onder een mini-kop,
 * groepen als gekleurd letterchipje. Notitie en pauze hebben een eigen vorm.
 * Volgorde via pijltjes; slepen van rijen is bewust niet in deze ronde.
 */

import { ChevronDown, ChevronUp, Coffee, Pencil, StickyNote, X } from 'lucide-react'
import { P } from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import {
  fmtMmSs, formatBlockPrescription, groupLabel,
  type Category, type ItemGroups, type PlannerBlock,
} from '@/lib/planner-blocks'
import { CategoryIcon } from './CategoryIcon'

const FASE_KOP: Record<'WARMUP' | 'COOLDOWN', string> = { WARMUP: 'Warming-up', COOLDOWN: 'Cooldown' }

export function BlockRows({ blocks, groups, readOnly = false, compact = false, onEdit, onRemove, onMove, onEditGroup }: {
  blocks: PlannerBlock[]
  groups: ItemGroups
  readOnly?: boolean
  compact?: boolean
  onEdit?: (b: PlannerBlock) => void
  onRemove?: (b: PlannerBlock) => void
  onMove?: (b: PlannerBlock, dir: -1 | 1) => void
  onEditGroup?: (letter: string) => void
}) {
  const catColors = useCategoryColors()
  if (blocks.length === 0) return null
  const fs = compact ? 10 : 12

  return (
    <div className={compact ? 'space-y-px' : 'space-y-1'} data-noselect>
      {blocks.map((b, i) => {
        const vorige = blocks[i - 1]
        const faseKop = b.phase && (i === 0 || vorige?.phase !== b.phase) ? FASE_KOP[b.phase] : null
        const hoofdKop = !b.phase && vorige?.phase && b.blockKind !== 'NOTE' ? 'Hoofddeel' : null
        const kop = faseKop ?? hoofdKop
        const cat = (b.exerciseCategory as Category) ?? 'STRENGTH'
        const kleur = b.blockKind === 'NOTE' ? P.gold : b.blockKind === 'BREAK' ? P.inkDim : catColors[cat] ?? P.inkMuted
        const groep = b.supersetGroup ? SUPERSET_COLORS[b.supersetGroup] : null
        const naam = b.blockKind === 'NOTE' ? (b.text ?? '') : b.blockKind === 'BREAK' ? `Pauze ${fmtMmSs(b.durationSec ?? 0)}` : (b.exerciseName ?? 'Oefening')
        const voorschrift = b.blockKind === 'EXERCISE' ? formatBlockPrescription(b) : ''
        const klikbaar = !readOnly && !!onEdit

        return (
          <div key={b.id}>
            {kop && (
              <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', padding: compact ? '3px 4px 1px' : '6px 6px 2px' }}>
                {kop}
              </p>
            )}
            <div
              className={`group/row relative flex ${compact ? 'items-start' : 'items-center'} gap-1.5 rounded-md min-w-0 ${klikbaar ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.05)]' : ''}`}
              style={{ padding: compact ? '2px 4px' : '6px 8px', fontStyle: b.blockKind === 'NOTE' ? 'italic' : undefined }}
              role={klikbaar ? 'button' : undefined}
              tabIndex={klikbaar ? 0 : undefined}
              onClick={klikbaar ? () => onEdit!(b) : undefined}
              onKeyDown={klikbaar ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit!(b) } } : undefined}
              title={b.notes ?? undefined}
            >
              <span className="shrink-0 flex" style={{ color: kleur }}>
                {b.blockKind === 'NOTE' ? <StickyNote size={compact ? 10 : 12} />
                  : b.blockKind === 'BREAK' ? <Coffee size={compact ? 10 : 12} />
                  : <CategoryIcon category={cat} size={compact ? 10 : 12} />}
              </span>
              {groep && b.supersetGroup && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onEditGroup?.(b.supersetGroup!) }}
                  title={groupLabel(b.supersetGroup, groups)}
                  className="athletic-mono shrink-0 rounded px-1"
                  style={{ fontSize: 8, fontWeight: 900, background: groep.bg, border: `1px solid ${groep.border}`, color: groep.text, lineHeight: '14px' }}
                >
                  {b.supersetGroup}
                </button>
              )}
              {compact ? (
                // Smal (dagcel): naam boven, voorschrift eronder. Op één regel
                // won het voorschrift het van de naam en bleef er van "Box
                // Squat" niets over.
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ color: b.blockKind === 'NOTE' ? P.inkMuted : P.ink, fontSize: fs, fontWeight: b.blockKind === 'EXERCISE' ? 600 : 400, lineHeight: 1.25 }}>
                    {naam}
                  </span>
                  {voorschrift && (
                    <span className="block athletic-mono truncate" style={{ color: P.inkMuted, fontSize: fs - 1, letterSpacing: '0.02em', lineHeight: 1.25 }}>
                      {voorschrift}
                    </span>
                  )}
                </span>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate" style={{ color: b.blockKind === 'NOTE' ? P.inkMuted : P.ink, fontSize: fs, fontWeight: b.blockKind === 'EXERCISE' ? 600 : 400 }}>
                    {naam}
                  </span>
                  {voorschrift && (
                    <span className="athletic-mono shrink-0" style={{ color: P.inkMuted, fontSize: fs - 1, letterSpacing: '0.02em' }}>
                      {voorschrift}
                    </span>
                  )}
                </>
              )}
              {!readOnly && (onMove || onRemove) && (
                <span
                  // In de smalle dagcel zweven de knopjes bij hover over de rij
                  // heen; in de layout zouden ze onzichtbaar de naam wegdrukken.
                  className={`flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-60 ${compact ? 'absolute right-0.5 top-1/2 -translate-y-1/2 rounded px-0.5' : 'shrink-0'}`}
                  style={compact ? { background: P.surface } : undefined}
                >
                  {onMove && (
                    <>
                      <button type="button" aria-label="Omhoog" disabled={i === 0} onClick={e => { e.stopPropagation(); onMove(b, -1) }} className="disabled:opacity-30" style={{ color: P.inkMuted }}>
                        <ChevronUp size={compact ? 11 : 13} />
                      </button>
                      <button type="button" aria-label="Omlaag" disabled={i === blocks.length - 1} onClick={e => { e.stopPropagation(); onMove(b, 1) }} className="disabled:opacity-30" style={{ color: P.inkMuted }}>
                        <ChevronDown size={compact ? 11 : 13} />
                      </button>
                    </>
                  )}
                  {!compact && onEdit && (
                    <button type="button" aria-label="Bewerken" onClick={e => { e.stopPropagation(); onEdit(b) }} style={{ color: P.inkMuted }}>
                      <Pencil size={12} />
                    </button>
                  )}
                  {onRemove && (
                    <button type="button" aria-label={`${naam} verwijderen`} onClick={e => { e.stopPropagation(); onRemove(b) }} className="hover:!text-[var(--p-danger)]" style={{ color: P.inkMuted }}>
                      <X size={compact ? 11 : 13} />
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
