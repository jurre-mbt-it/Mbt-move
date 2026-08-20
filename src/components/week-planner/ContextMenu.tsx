'use client'

/**
 * Rechtermuisknop-menu, in de stijl van de rest van de donkere UI.
 *
 * Bewust geen Radix: `@radix-ui/react-context-menu` zit niet in het project en
 * dit menu heeft niets nodig wat het niet zelf kan. Wél in een portal, want de
 * weekkaarten hebben `overflow` en zouden het menu anders afknippen.
 *
 * Het sluit op alles wat "ik ben hier klaar mee" betekent: klik ernaast,
 * Escape, scrollen, een tweede rechtermuisklik ergens anders, of het venster
 * dat de focus verliest. Een menu dat blijft hangen boven een scrollende
 * kalender wijst naar de verkeerde dag.
 */

import { useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { P, CARD } from '@/lib/palette'

export type ContextMenuItem =
  | { type: 'separator' }
  | {
      type?: 'item'
      label: string
      icon?: ReactNode
      onSelect: () => void
      disabled?: boolean
      /** Verwijderen en dergelijke: rood. */
      danger?: boolean
      /** Kleine toelichting rechts, bijvoorbeeld wat er op het klembord staat. */
      hint?: string
    }

export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null

const BREEDTE = 208

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  /**
   * Bij een klik onderaan het scherm zou het menu half buiten beeld openen, dus
   * het moet ná het meten van zijn eigen hoogte verschoven worden.
   *
   * Dat gebeurt hier in een ref-callback die de stijl rechtstreeks zet, niet in
   * een effect met state: een ref-callback loopt tijdens de commit, dus vóór de
   * browser tekent. Geen extra render, en geen frame waarin het menu op de
   * verkeerde plek staat.
   */
  const plaats = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !state) return
      const marge = 8
      node.style.left = `${Math.min(state.x, window.innerWidth - BREEDTE - marge)}px`
      node.style.top = `${Math.max(marge, Math.min(state.y, window.innerHeight - node.offsetHeight - marge))}px`
      node.style.visibility = 'visible'
    },
    [state],
  )

  useEffect(() => {
    if (!state) return
    const sluit = () => onClose()
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // `capture` op scroll: scroll-events van een binnenste container bubbelen niet.
    window.addEventListener('scroll', sluit, true)
    window.addEventListener('resize', sluit)
    window.addEventListener('blur', sluit)
    document.addEventListener('keydown', opToets)
    return () => {
      window.removeEventListener('scroll', sluit, true)
      window.removeEventListener('resize', sluit)
      window.removeEventListener('blur', sluit)
      document.removeEventListener('keydown', opToets)
    }
  }, [state, onClose])

  if (!state || typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* Vangt de klik ernaast op. Ook `onContextMenu`, zodat een tweede
          rechtermuisklik het menu verplaatst in plaats van er twee te openen. */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      <div
        ref={plaats}
        role="menu"
        className="fixed z-[61] overflow-hidden rounded-lg py-1 shadow-xl"
        style={{...CARD, left: state.x,
          top: state.y,
          width: BREEDTE,
          // `plaats` maakt 'm zichtbaar zodra hij goed staat.
          visibility: 'hidden',}}
      >
        {state.items.map((item, i) =>
          item.type === 'separator' ? (
            <div key={`sep-${i}`} className="my-1 h-px" style={{ background: P.line }} />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { onClose(); item.onSelect() }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors disabled:opacity-40"
              style={{ color: item.danger ? P.danger : P.ink, fontSize: 12 }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = P.control
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && (
                <span className="shrink-0 truncate" style={{ color: P.inkDim, fontSize: 10, maxWidth: 72 }}>
                  {item.hint}
                </span>
              )}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  )
}
