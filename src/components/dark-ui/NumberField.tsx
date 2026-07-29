'use client'

/**
 * Getalveld dat je laat uittypen.
 *
 * Het probleem dat dit oplost: een `<input type="number">` waarvan de
 * onChange meteen klemt ("Math.max(1, ...)") is niet te bewerken. Zodra je het
 * veld leegmaakt om een ander getal in te tikken, springt de waarde naar de
 * ondergrens en staat er weer een cijfer waar je overheen moet typen. Bij een
 * datumveld is de variant hiervan nog vervelender, want daar wordt een half
 * getypte datum een heel andere dag.
 *
 * De regel: tijdens het typen is de tekst van de gebruiker de waarheid, en pas
 * bij het verlaten van het veld (of Enter) rekenen we die om en klemmen we hem.
 * Blijft het veld leeg of staat er onzin, dan keert de vorige waarde terug in
 * plaats van de ondergrens.
 */

import { useState } from 'react'

export function NumberField({
  value,
  onCommit,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step,
  className,
  style,
  'aria-label': ariaLabel,
}: {
  value: number
  /** Krijgt de geklemde waarde, pas bij blur of Enter. */
  onCommit: (n: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}) {
  // null betekent: niemand is aan het typen, dus toon gewoon de prop. Zo
  // hoeft er geen effect te bestaan dat externe wijzigingen naar binnen kopieert.
  const [tekst, setTekst] = useState<string | null>(null)

  const vastleggen = () => {
    if (tekst === null) return
    const ruw = tekst.trim()
    const n = Number(ruw)
    if (ruw !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
    setTekst(null)
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      step={step}
      aria-label={ariaLabel}
      value={tekst ?? String(value)}
      onChange={(e) => setTekst(e.target.value)}
      onBlur={vastleggen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        // Escape gooit weg wat je typte en toont weer de opgeslagen waarde.
        if (e.key === 'Escape') { setTekst(null); e.currentTarget.blur() }
      }}
      className={className}
      style={style}
    />
  )
}
