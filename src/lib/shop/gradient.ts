/** Deterministische, nette gradient als hero-fallback wanneer een product
 *  (nog) geen afbeelding heeft. Geeft elke kaart een eigen, premium-ogende
 *  kleurstelling op basis van de slug — zelfde product = zelfde gradient. */

// Diep petrol als basis, warme merktonen als uitloop, plus één turquoise voor
// variatie. Geen kleuren buiten het palet.
const PAIRS: Array<[string, string]> = [
  ['#081A1C', '#C9613F'], // petrol → brand-oranje (deep)
  ['#0B2022', '#A85434'], // petrol → warm roest
  ['#081A1C', '#F09A4A'], // petrol → amber/goud
  ['#0B2022', '#E87A55'], // petrol → brand
  ['#081A1C', '#B4763A'], // petrol → amber-bruin
  ['#0B2022', '#45A8A2'], // petrol → diep turquoise (variatie)
]

export function heroGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return `linear-gradient(135deg, ${a} 0%, ${b} 165%)`
}
