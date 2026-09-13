'use client'

/**
 * Bouwstenen van de blok-formulieren in de "+ Oefening"-pop-up. Eén stijl voor
 * label, hint, schakelaar en segment, zodat de vijf formulieren als één
 * scherm lezen. Puur presentatie; geen kennis van blokken.
 */

import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { DarkInput, DarkMenuSelect, MetaLabel, P } from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { GROUP_LETTERS, groupLabel, type Category, type ItemGroups } from '@/lib/planner-blocks'
import { CategoryIcon, CATEGORY_LABELS } from '@/components/week-planner/CategoryIcon'

export function Field({ label, hint, children, className }: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <MetaLabel>{label}</MetaLabel>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[11px] mt-1 leading-snug" style={{ color: P.inkDim }}>{hint}</p>}
    </div>
  )
}

/**
 * Getalveld dat je écht leeg kunt maken. Tijdens het typen is de tekst de
 * waarheid (zie AGENTS.md "corrigeer nooit tijdens het typen"); leeg = null.
 */
export function NullableNumField({ value, onChange, min, max, step, placeholder, ariaLabel, className }: {
  value: number | null
  onChange: (v: number | null) => void
  min: number
  max: number
  step?: number
  placeholder?: string
  ariaLabel: string
  className?: string
}) {
  const [concept, setConcept] = useState<string | null>(null)
  const getoond = concept ?? (value == null ? '' : String(value))
  return (
    <DarkInput
      type="number" inputMode="decimal" min={min} max={max} step={step}
      value={getoond} placeholder={placeholder ?? '–'} aria-label={ariaLabel}
      className={className}
      onChange={ev => {
        const rauw = ev.target.value
        setConcept(rauw)
        if (rauw === '') { onChange(null); return }
        const n = Number(rauw)
        if (!Number.isFinite(n)) return
        const afgerond = (step ?? 1) >= 1 ? Math.round(n) : n
        onChange(Math.min(max, Math.max(min, afgerond)))
      }}
      onBlur={() => setConcept(null)}
    />
  )
}

export function OptionSwitch({ checked, onCheckedChange, label, hint, disabled }: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <SwitchPrimitive.Root
        id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
        className="relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(232,122,85,0.5)]"
        style={{
          width: 36, height: 20, marginTop: 1,
          background: checked ? P.brand : P.track,
          border: `1px solid ${checked ? P.brand : P.lineStrong}`,
        }}
      >
        <SwitchPrimitive.Thumb
          className="block rounded-full transition-transform"
          style={{ width: 14, height: 14, background: P.ink, transform: `translateX(${checked ? 18 : 2}px)` }}
        />
      </SwitchPrimitive.Root>
      <span className="min-w-0">
        <span className="block text-xs font-semibold" style={{ color: P.ink }}>{label}</span>
        {hint && <span className="block text-[11px] leading-snug" style={{ color: P.inkDim }}>{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className="px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors"
            style={active
              ? { background: P.control, color: P.ink, border: `1px solid ${P.lineStrong}` }
              : { color: P.inkMuted, border: '1px solid transparent' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function RangeToggle({ isRange, onToggle, title }: { isRange: boolean; onToggle: () => void; title?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={isRange}
      title={title ?? (isRange ? 'Terug naar één waarde' : 'Bereik instellen (min en max)')}
      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
      style={isRange
        ? { color: P.brand, background: 'rgba(232,122,85,0.12)', border: '1px solid rgba(232,122,85,0.4)' }
        : { color: P.inkDim, border: `1px solid ${P.line}`, background: P.surfaceLow }}>
      <SlidersHorizontal className="w-3.5 h-3.5" />
    </button>
  )
}

/** "m:ss"-invoer; kale cijfers gelden als minuten. Normaliseren pas bij blur. */
export function MmSsInput({ valueSec, onChange, ariaLabel, className }: {
  valueSec: number | null
  onChange: (sec: number | null) => void
  ariaLabel: string
  className?: string
}) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const [concept, setConcept] = useState<string | null>(null)
  const getoond = concept ?? (valueSec == null ? '' : fmt(valueSec))
  function parse(raw: string): number | null {
    const t = raw.trim()
    if (!t) return null
    const m = t.match(/^(\d{1,3})(?::([0-5]?\d))?$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2] ?? 0)
  }
  return (
    <DarkInput
      value={getoond} placeholder="m:ss" inputMode="numeric" aria-label={ariaLabel} className={className}
      onChange={ev => {
        setConcept(ev.target.value)
        const s = parse(ev.target.value)
        if (s != null || ev.target.value.trim() === '') onChange(s)
      }}
      onBlur={() => setConcept(null)}
    />
  )
}

export type ExerciseCandidate = {
  id: string
  name: string
  category: string
  defaultRepUnit?: string | null
  isUnilateral?: boolean
}

/**
 * Zoeken in de bibliotheek met een categorie-filterchip, zoals de oude
 * builder; gekozen oefening staat als chip met een kruisje. Pijltjes en Enter
 * werken in de lijst.
 */
export function ExerciseCombobox({ value, onChange, defaultCategory, categories, autoFocus, inputRef }: {
  value: ExerciseCandidate | null
  onChange: (c: ExerciseCandidate | null) => void
  /** Startfilter (lift-stand). null = geen filter. */
  defaultCategory: Category | null
  /** Vaste set (cardio-stand): filtert client-side, geen chip. */
  categories?: Category[]
  autoFocus?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const catColors = useCategoryColors()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [catFilter, setCatFilter] = useState<Category | null>(categories ? null : defaultCategory)
  const [cursor, setCursor] = useState(0)
  const eigenRef = useRef<HTMLInputElement | null>(null)
  const ref = inputRef ?? eigenRef

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw = [] } = (trpc.exercises.list.useQuery as any)(
    { query: search || undefined, category: catFilter ?? undefined },
    { staleTime: 30_000 },
  ) as { data: ExerciseCandidate[] }
  const kandidaten = (categories ? raw.filter(c => (categories as string[]).includes(c.category)) : raw).slice(0, 40)

  useEffect(() => { setCursor(0) }, [search, catFilter])

  function kies(c: ExerciseCandidate) {
    onChange(c); setSearch(''); setOpen(false)
  }

  if (value) {
    const cat = (value.category as Category) ?? 'STRENGTH'
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg" style={{ background: P.surfaceLow, border: `1px solid ${P.lineStrong}` }}>
        <span style={{ color: catColors[cat] }} className="shrink-0 flex"><CategoryIcon category={cat} size={13} /></span>
        <span className="flex-1 truncate text-sm" style={{ color: P.ink }}>{value.name}</span>
        <button type="button" onClick={() => { onChange(null); setTimeout(() => ref.current?.focus(), 0) }}
          aria-label="Andere oefening kiezen" className="shrink-0" style={{ color: P.inkMuted }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: P.inkDim }} />
          <DarkInput
            ref={ref} autoFocus={autoFocus} value={search} placeholder="Zoek oefening…" className="pl-8"
            aria-label="Oefening zoeken" aria-expanded={open}
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(kandidaten.length - 1, c + 1)); setOpen(true) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
              if (e.key === 'Enter' && open && kandidaten[cursor]) { e.preventDefault(); kies(kandidaten[cursor]) }
              if (e.key === 'Escape') setOpen(false)
            }}
          />
        </div>
        {!categories && defaultCategory && (
          catFilter ? (
            <button type="button" onClick={() => setCatFilter(null)}
              className="inline-flex items-center gap-1 px-2 h-9 rounded-lg text-[11px] font-semibold shrink-0"
              style={{ background: `${catColors[catFilter]}20`, color: catColors[catFilter], border: `1px solid ${catColors[catFilter]}` }}>
              {CATEGORY_LABELS[catFilter]} <X className="w-3 h-3" />
            </button>
          ) : (
            <button type="button" onClick={() => setCatFilter(defaultCategory)}
              className="px-2 h-9 rounded-lg text-[11px] shrink-0"
              style={{ color: P.inkMuted, border: `1px solid ${P.lineStrong}` }}
              title={`Alleen ${CATEGORY_LABELS[defaultCategory]} tonen`}>
              Alle
            </button>
          )
        )}
      </div>
      {open && kandidaten.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg p-1 z-20 space-y-0.5"
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}>
          {kandidaten.map((c, i) => {
            const cat = (c.category as Category) ?? 'STRENGTH'
            return (
              <li key={c.id} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => kies(c)}
                  onMouseEnter={() => setCursor(i)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md flex items-center gap-2 text-xs"
                  style={{ background: i === cursor ? P.control : 'transparent', color: P.ink }}>
                  <span style={{ color: catColors[cat] }} className="shrink-0 flex"><CategoryIcon category={cat} size={11} /></span>
                  <span className="flex-1 truncate">{c.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function GroupSelect({ value, onChange, groups }: {
  value: string | null
  onChange: (v: string | null) => void
  groups: ItemGroups
}) {
  const options = [
    { value: '-', label: 'Geen groep' },
    ...GROUP_LETTERS.map(l => ({ value: l, label: groupLabel(l, groups) })),
  ]
  return (
    <DarkMenuSelect
      value={value ?? '-'}
      onValueChange={v => onChange(v === '-' ? null : v)}
      options={options}
      placeholder="Groep"
      ariaLabel="Groep (superset of circuit)"
    />
  )
}
