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
  bg: '#0E2729',
  surfaceLow: '#123033',
  surface: '#15363A',
  surfaceHi: '#1C4448',
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
  teal: '#45A8A2',
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
