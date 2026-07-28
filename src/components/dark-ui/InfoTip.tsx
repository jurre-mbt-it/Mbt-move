/**
 * Uitleg-tooltip bij een instelling.
 *
 * Het uiterlijk komt van de tooltip die al bij de tendinopathie-toggle in de
 * program-builder stond: koraal vlak, donkere tekst, klein. Het gedrag is wat
 * daar ontbrak. Die versie was `hidden group-hover:block`, en dat betekent geen
 * uitleg op de iPad (geen hover) en geen uitleg met het toetsenbord. Therapeuten
 * werken op beide, dus dit ding opent op hover, op focus en op een klik of tik.
 *
 * Sluiten kan met Escape, door weg te klikken, of door weg te tabben. Een tip
 * die met een klik is geopend blijft staan als de muis weggaat, want anders
 * verdwijnt hij op een tablet meteen weer.
 */
'use client'

import * as React from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/lib/palette'

export function InfoTip({
  children,
  label,
  side = 'right',
  className,
}: {
  children: React.ReactNode
  /** Wat het icoon aankondigt voor een screenreader, bv. "Flexibele week uitleg". */
  label: string
  /** Kant waar het blokje opengaat. Gebruik 'left' voor items rechts in een smalle balk. */
  side?: 'left' | 'right'
  className?: string
}) {
  const [hovered, setHovered] = React.useState(false)
  const [pinned, setPinned] = React.useState(false)
  const [shift, setShift] = React.useState(0)
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  const tipRef = React.useRef<HTMLSpanElement>(null)
  // useId en niet een eigen teller: die loopt server- en client-side uit de pas
  // en levert een hydration-mismatch op.
  const id = React.useId()

  const open = hovered || pinned

  // Binnen het venster houden. De instellingenbalk van de builder scrollt
  // horizontaal, dus een tip die 24px naar rechts opent valt op iPad-breedte
  // (768px) net buiten beeld. Meet na het openen en schuif hem terug.
  // Convergeert in één stap: zodra hij past is het verschil nul.
  React.useLayoutEffect(() => {
    if (!open) {
      if (shift !== 0) setShift(0)
      return
    }
    const el = tipRef.current
    if (!el) return
    const GUTTER = 8
    const rect = el.getBoundingClientRect()
    const overRight = rect.right - (window.innerWidth - GUTTER)
    const overLeft = GUTTER - rect.left
    const delta = overRight > 0 ? -overRight : overLeft > 0 ? overLeft : 0
    if (Math.abs(delta) > 0.5) setShift((s) => s + delta)
  }, [open, shift])

  // Weg-klikken en Escape sluiten alleen een vastgezette tip. Een hover-tip
  // verdwijnt vanzelf zodra de muis weggaat, daar hoeft geen listener voor te
  // draaien.
  React.useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  return (
    <span ref={wrapRef} className={cn('relative inline-flex shrink-0', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          // De tips zitten vaak náást een toggle-knop. Zonder dit schakelt een
          // klik op het icoon ook de instelling om.
          e.preventDefault()
          e.stopPropagation()
          setPinned((v) => !v)
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex items-center justify-center rounded-full cursor-help"
        style={{ color: open ? P.brand : P.inkMuted, width: 18, height: 18 }}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          className={cn(
            'absolute top-0 z-50 block rounded-lg px-3 py-2 shadow-xl',
            side === 'right' ? 'left-6' : 'right-6',
          )}
          style={{
            // Nooit breder dan het venster, ook niet op een telefoon.
            width: 'min(16rem, calc(100vw - 24px))',
            transform: shift ? `translateX(${shift}px)` : undefined,
            background: P.brand,
            color: P.bg,
            fontSize: 12,
            lineHeight: '17px',
            fontWeight: 500,
          }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
