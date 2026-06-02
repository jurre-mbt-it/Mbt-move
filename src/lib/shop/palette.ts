/**
 * Kleurenpalet voor de shop. Plain module (GÉÉN 'use client') zodat zowel
 * server- als client-componenten de échte waarden importeren.
 *
 * Let op: importeer voor de storefront NIET `P` uit `@/components/dark-ui` —
 * dat is een 'use client'-module, en in een server-component levert dat een
 * client-reference proxy op waardoor `P.lime` e.d. `undefined` zijn (alle
 * inline-kleuren vallen dan stil weg). Waarden hier zijn synchroon met de
 * `P` uit dark-ui.
 */
export const P = {
  bg: '#0A0E0F',
  surface: '#141A1B',
  surfaceHi: '#1C2425',
  surfaceLow: '#0F1415',
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  ink: '#F5F7F6',
  inkMuted: '#7B8889',
  inkDim: '#4A5454',
  lime: '#BEF264',
  limeDark: '#65A30D',
  brand: '#e87a55',
} as const
