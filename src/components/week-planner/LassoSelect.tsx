'use client'

/**
 * Selectiestand voor een rijenlijst: muis ingedrukt houden en een rechthoek
 * over de rijen trekken selecteert alles wat erin valt; een klik op een rij
 * wisselt die ene rij. Werkt op elementen met `data-block-id` binnen de
 * container. Alleen actief als `actief` waar is, zodat slepen en bewerken van
 * rijen buiten de selectiestand gewoon blijven werken.
 */

import { useRef, useState } from 'react'
import { P } from '@/components/dark-ui'

type Rect = { x: number; y: number; w: number; h: number }

export function LassoSelect({ actief, selected, onChange, children, className }: {
  actief: boolean
  selected: Set<string>
  onChange: (next: Set<string>) => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ x: number; y: number; additief: boolean; bewogen: boolean } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  function rijenIn(r: Rect): string[] {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return []
    const ids: string[] = []
    ref.current!.querySelectorAll<HTMLElement>('[data-block-id]').forEach(el => {
      const b = el.getBoundingClientRect()
      const rx = b.left - box.left, ry = b.top - box.top
      const overlapt = rx < r.x + r.w && rx + b.width > r.x && ry < r.y + r.h && ry + b.height > r.y
      if (overlapt) ids.push(el.dataset.blockId!)
    })
    return ids
  }

  if (!actief) return <div ref={ref} className={className}>{children}</div>

  return (
    <div
      ref={ref}
      className={`relative select-none ${className ?? ''}`}
      style={{ cursor: 'crosshair' }}
      onPointerDown={e => {
        if (e.button !== 0) return
        const box = ref.current!.getBoundingClientRect()
        start.current = { x: e.clientX - box.left, y: e.clientY - box.top, additief: e.shiftKey || e.metaKey || e.ctrlKey, bewogen: false }
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetische pointer of oud toestel: dan zonder capture */ }
      }}
      onPointerMove={e => {
        if (!start.current) return
        const box = ref.current!.getBoundingClientRect()
        const x = e.clientX - box.left, y = e.clientY - box.top
        const r = { x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), w: Math.abs(x - start.current.x), h: Math.abs(y - start.current.y) }
        if (r.w > 4 || r.h > 4) { start.current.bewogen = true; setRect(r) }
      }}
      onPointerUp={e => {
        const s = start.current
        start.current = null
        if (!s) return
        const box = ref.current!.getBoundingClientRect()
        if (s.bewogen && rect) {
          const ids = rijenIn(rect)
          const next = new Set(s.additief ? selected : [])
          ids.forEach(id => next.add(id))
          onChange(next)
        } else {
          // Klik: één rij wisselen.
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')
          const id = el?.dataset.blockId
          if (id) {
            const next = new Set(selected)
            if (next.has(id)) next.delete(id); else next.add(id)
            onChange(next)
          }
        }
        setRect(null)
        void box
      }}
      onPointerCancel={() => { start.current = null; setRect(null) }}
    >
      {children}
      {rect && (
        <div
          className="absolute pointer-events-none rounded"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: `1px solid ${P.brand}`, background: 'rgba(232,122,85,0.12)' }}
        />
      )}
    </div>
  )
}
