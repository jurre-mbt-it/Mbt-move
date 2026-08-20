/**
 * Kleuren en escaping die zowel de shell als de footer nodig heeft.
 *
 * Staat apart zodat `shell.ts` en `footer.ts` elkaar niet circulair hoeven te
 * importeren. Vóór 2026-08-20 had elk mailtype zijn eigen kopie van deze
 * kleuren, en waren ze al uit elkaar gelopen.
 */

export const EMAIL_PALETTE = {
  bg: '#0E2729',
  surface: '#15363A',
  surfaceHi: '#1C4448',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
  inkDim: '#86A3A1',
  accent: '#E87A55',
  danger: '#E2574C',
  line: 'rgba(212,232,230,0.20)',
} as const

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
