/** Prijs-helpers voor de consumenten-shop. Prijzen worden in centen (EUR)
 *  opgeslagen om afrondingsfouten te voorkomen. */

/** Centen → nette NL-prijs, bv 3495 → "€ 34,95". */
export function formatPriceCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(cents / 100)
}

/** Euro-invoer (string) → centen. "34,95" of "34.95" → 3495. */
export function eurosToCents(input: string): number {
  const normalized = input.replace(/\s/g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  if (Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

/** Centen → euro-string voor invoervelden, bv 3495 → "34.95". */
export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2)
}
