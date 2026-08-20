/**
 * Het palet van MBT Gym — de JS-kant van de tokens in `app/globals.css`
 * (`:root --p-*`). Beide houden dezelfde waarden: CSS en classNames pakken
 * `var(--p-…)`, inline styles en SVG-props pakken `P`.
 *
 * Plain module, bewust GÉÉN 'use client': zo lezen server- én clientcomponenten
 * de échte waarden. Importeer je in een servercomponent uit een client-module,
 * dan krijg je een client-reference proxy en zijn `P.lime` en co. `undefined` —
 * alle inline kleuren vallen dan stil weg.
 *
 * Bewust gewone hexcodes en geen `var()`: recharts en losse SVG's zetten deze
 * waarden als presentatie-attribuut (`fill=`, `stroke=`), en daar wordt `var()`
 * niet opgelost.
 */
export const P = {
  // Vlakken van donker naar licht: bg → surfaceLow → surface → surfaceHi.
  // surfaceLow is verdiept binnen een kaart en ligt dus bóven de pagina.
  // Waarden volgen docs/app-ontwerpsysteem.md: dieper dan de #0E2729 van de
  // praktijksite, zodat de app niet als uitsnede daarvan leest. De tint blijft
  // gelijk aan het origineel; alleen de diepte doet het werk.
  bg: '#0A1C1D',
  surfaceLow: '#0F2628',
  surface: '#163539',
  surfaceHi: '#1D4348',
  line: 'rgba(212,232,230,0.09)',
  lineStrong: 'rgba(212,232,230,0.20)',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
  inkDim: '#86A3A1',
  // `lime` heet historisch zo; de kleur is groen (goed / hersteld / gehaald).
  lime: '#5FD08A',
  limeDark: '#3FA968',
  limeMid: '#7ADCA0',
  limeDeep: '#2E8F55',
  brand: '#E87A55',
  brandDeep: '#C9613F',
  danger: '#F0796C',
  dangerDark: '#8E2F26',
  gold: '#F5B942',
  goldWarm: '#F09A4A',
  orange: '#EE8447',
  ice: '#9FCEC9',
  // Instrument-kaart (docs/app-ontwerpsysteem.md). Spiegelt --p-card-* in
  // globals.css; verander je er een, verander ze allebei.
  cardTop: '#163539',
  cardBot: '#0F2628',
  cardEdge: 'rgba(255,255,255,0.05)',
  cardEdgeTop: 'rgba(255,255,255,0.07)',
  cardShadow: '0 8px 20px rgba(0,0,0,0.34)',
  // Zonder kader: leesschermen, waar de haarlijn wél draagt.
  flatBg: '#0C2224',
  hairline: 'rgba(212,232,230,0.16)',
  teal: '#45A8A2',
} as const

/**
 * De Instrument-kaart als los stijlobject, zodat elk scherm hem op dezelfde
 * manier krijgt: een verloop van licht naar donker, een haarlijn die bovenaan
 * net iets lichter is, en een schaduw die de kaart op de grond legt.
 *
 * Gebruik `style={{ ...CARD }}`. Wil je een accentrand (P.brand, P.ice), zet
 * die dan ná de spread, dan wint hij: `style={{ ...CARD, border: ... }}`.
 *
 * Spiegelt `.base-card` in globals.css. Verander je er een, verander ze allebei.
 */
export const CARD = {
  background: `linear-gradient(180deg, ${P.cardTop} 0%, ${P.cardBot} 100%)`,
  border: `1px solid ${P.cardEdge}`,
  borderTopColor: P.cardEdgeTop,
  boxShadow: P.cardShadow,
} as const

/**
 * Categorieën die naast elkaar leesbaar moeten zijn: collecties, cardio-
 * soorten, superset-groepen, grafiekreeksen. Acht tinten die alle acht boven
 * petrol staan; buren verschillen in tint én helderheid. Gelijk aan
 * `--p-data-*` in globals.css.
 */
export const DATA_COLORS = [
  '#9FCEC9', // mint
  '#5FD08A', // groen
  '#F5B942', // goud
  '#E87A55', // brand-oranje
  '#F0796C', // koraal
  '#7FB0D8', // staalblauw
  '#45A8A2', // diep turquoise
  '#D9C08A', // zand
] as const

/**
 * Kleur per trainingssoort. Eén bron voor de hele app; de kalender, de
 * oefeningkaarten en de kiezers lezen hier allemaal uit.
 *
 * Belangrijk: deze tinten mogen NIET samenvallen met de statuskleuren van de
 * weekplanner (groen = gedaan, goud = bezig, oranje = deels, koraal = gemist).
 * Op een kalendertegel dragen de twee namelijk allebei betekenis — de rand zegt
 * hoe het ging, het icoon zegt wat het was — en vallen ze samen, dan leest een
 * week vol gemiste trainingen als een week vol afgevinkte trainingen. Daarom
 * koele en gedempte tinten hier, en de warme signaalkleuren voor status.
 */
/**
 * Leesbare tekstkleur op een gekozen vlak.
 *
 * De categoriekleuren zijn instelbaar per therapeut (/therapist/settings/kleuren).
 * Zolang een kleur alleen de letter kleurde maakte dat niet uit, maar zodra hij
 * een vlak vult moet de tekst mee bewegen: op een lichte tint hoort donkere
 * inkt, op een donkere tint lichte. Vaste donkere tekst werkt alleen bij de
 * standaardtinten en valt weg zodra iemand iets donkers kiest.
 *
 * Relatieve helderheid volgens WCAG. Niet-hex waarden (rgba, gradient) leveren
 * lichte inkt op; dat is de veilige kant op een donkere app.
 */
/**
 * Lichte variant van een categoriekleur, om een vlak mee te vullen.
 *
 * De rauwe categoriekleuren zijn bedoeld om een letter of icoon mee te kleuren.
 * Als vulling werken ze niet: `CARDIO` (#45A8A2) is een middendonkere turquoise,
 * en daar is geen tekstkleur voor die goed leest. Lichte tekst wordt modder,
 * donkere tekst valt weg.
 *
 * Daarom trekt deze functie elke tint naar dezelfde lichtheid. De kleur blijft
 * herkenbaar (dezelfde tint), maar het vlak is altijd licht genoeg voor donkere
 * inkt. Dat is ook hoe de gevulde blokjes in het ontwerpvoorbeeld werkten.
 *
 * Werkt ook op een zelfgekozen kleur uit /therapist/settings/kleuren.
 */
export function fillFor(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l0 = (max + min) / 2
  let h = 0, sat = 0
  if (max !== min) {
    const d = max - min
    sat = l0 > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0)
      : max === g ? (b - r) / d + 2
      : (r - g) / d + 4
    h /= 6
  }
  // Vaste lichtheid, verzadiging geknepen: anders gaat een fel gekozen kleur
  // alsnog schreeuwen naast de oranje actiekleur.
  const L = 0.74, S = Math.min(Math.max(sat, 0.28), 0.52)
  const hue = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return q0 + (q1 - q0) * 6 * t
    if (t < 1 / 2) return q1
    if (t < 2 / 3) return q0 + (q1 - q0) * (2 / 3 - t) * 6
    return q0
  }
  const q1 = L < 0.5 ? L * (1 + S) : L + S - L * S
  const q0 = 2 * L - q1
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${to(hue(h + 1 / 3))}${to(hue(h))}${to(hue(h - 1 / 3))}`
}

export function textOn(background: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(background.trim())
  if (!m) return P.ink
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const L =
    0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.45 ? P.bg : P.ink
}

export const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:    '#9FCEC9', // mint
  MOBILITY:    '#7FB0D8', // staalblauw
  PLYOMETRICS: '#D9C08A', // zand
  CARDIO:      '#45A8A2', // diep turquoise
  STABILITY:   '#B9A6D4', // lila
}

/** Hartslagzones houden hun eigen oplopende reeks: koel bij laag, warm bij hoog. */
export const ZONE_COLORS: Record<string, string> = {
  Z1: P.ice,
  Z2: P.lime,
  Z3: P.gold,
  Z4: P.orange,
  Z5: P.danger,
} as const

/** Tokens voor grafieken (recharts en eigen SVG's). */
export const DARK_CHART_COLORS = {
  primary: P.lime,
  secondary: P.ice,
  warning: P.gold,
  danger: P.danger,
  accent: DATA_COLORS[6],
  grid: P.line,
  gridStrong: P.lineStrong,
  axis: P.inkDim,
  label: P.inkMuted,
  tooltipBg: P.surfaceHi,
  tooltipBorder: P.lineStrong,
  tooltipText: P.ink,
} as const
