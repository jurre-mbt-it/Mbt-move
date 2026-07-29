'use client'

/**
 * De sleep-onderdelen van de plan-editor: een dag die een workout kan
 * ontvangen, en een workout die je kunt oppakken.
 *
 * Los van de pagina zodat ze zonder server-data te bekijken zijn — juist bij
 * slepen is "werkt klikken nog?" iets wat je moet zíen, niet aannemen.
 */

import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import {
  MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'

import { P } from '@/lib/palette'

/**
 * Sensors voor de plan-kalender.
 *
 * MouseSensor met een afstandsdrempel, bewust NIET PointerSensor: die
 * onderdrukt het klik-event dat op een pointer-interactie volgt, waarmee het
 * openen van een workout stil stukgaat. Touch krijgt lang-indrukken, anders
 * vecht slepen op een tablet met scrollen.
 */
export function usePlannerSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
}

/**
 * Eén dag in de weekkalender, tegelijk de drop-zone voor een gesleepte
 * workout. De rand kleurt mee zodra je erboven hangt: zonder dat signaal laat
 * je los en hoop je maar dat het de goede dag was.
 */
export function DagCel({
  dayId, onContextMenu, children,
}: {
  dayId: string
  onContextMenu?: (e: ReactMouseEvent) => void
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId })
  return (
    <div
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      className="rounded-lg p-2 transition-colors"
      style={{
        background: isOver ? P.surface : P.surfaceLow,
        border: `1px solid ${isOver ? P.brand : P.line}`,
        minHeight: 96,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Een workout die je naar een andere dag kunt slepen.
 *
 * Alleen `listeners`, bewust niet dnd-kits `attributes`: die zetten
 * `role="button"` plus een tabIndex op deze div, terwijl er binnenin al twee
 * echte knoppen staan (openen en verwijderen). Een knop in een knop is voor
 * een schermlezer onzin. Slepen met het toetsenbord vervalt daarmee; alle
 * verplaats-acties zitten daarom óók in het rechtermuisknop-menu.
 */
export function SleepbaarItem({
  itemId, geknipt = false, onContextMenu, children,
}: {
  itemId: string
  /** Staat op het klembord om geknipt te worden: toon 'm alvast als vertrokken. */
  geknipt?: boolean
  onContextMenu?: (e: ReactMouseEvent) => void
  children: ReactNode
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: itemId })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="Versleepbare workout"
      onContextMenu={onContextMenu}
      className="mb-1 rounded"
      style={{
        background: P.surfaceHi,
        opacity: isDragging ? 0.35 : geknipt ? 0.5 : 1,
        // `manipulation`, niet `none`: op een tablet moet je nog vanaf een
        // tegel kunnen scrollen. Slepen begint daar met lang indrukken.
        touchAction: 'manipulation',
        cursor: 'grab',
      }}
    >
      {children}
    </div>
  )
}
