/** Deterministische, nette gradient als hero-fallback wanneer een product
 *  (nog) geen afbeelding heeft. Geeft elke kaart een eigen, premium-ogende
 *  kleurstelling op basis van de slug — zelfde product = zelfde gradient. */

// On-brand: warme oranje/amber-tonen (MBT-Gym brand) + één gedempt staalblauw
// voor variatie. Geen lime/paars — dat past niet bij de huisstijl.
const PAIRS: Array<[string, string]> = [
  ['#15110E', '#c9613f'], // diep → brand-oranje (deep)
  ['#14100F', '#9a3412'], // diep → warm roest
  ['#15120B', '#F39644'], // diep → amber/goud
  ['#121516', '#e87a55'], // diep → brand
  ['#130F0D', '#b45309'], // diep → amber-bruin
  ['#0E1417', '#3b6ea5'], // diep → gedempt staalblauw (variatie)
]

export function heroGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return `linear-gradient(135deg, ${a} 0%, ${b} 165%)`
}
