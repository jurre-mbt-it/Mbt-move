/**
 * Escape user content voor veilige HTML-injectie. Verplicht voor alle
 * velden die uit de database komen (patient-namen, notes, etc.) —
 * anders breekt een `<` in een note de hele PDF of erger.
 */
export function esc(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Formatteer een datum (Date of ISO-string) als "26 mei 2026" (nl-NL).
 */
export function formatDateLong(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** "26 MEI 2026" — gebruikt in mono uppercase meta-labels. */
export function formatDateMono(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d
    .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '')
}

/** "26 mei" — korte datum voor lijsten. */
export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}
