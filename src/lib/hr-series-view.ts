/**
 * Het rekenwerk achter de hartslagsectie bij één training: de zoneverdeling en
 * de cardiale ontkoppeling. Puur — reeks in, getallen uit, geen React.
 *
 * Dit is een van de bewust gespiegelde stukken met de mobiele repo
 * (`lib/hr-series-view.ts` daar). De app tekende dit scherm het eerst; sinds de
 * browser en de iPad dezelfde training tonen, moesten de getallen eronder wel
 * uit dezelfde regels komen. `npm run check:mirror` laadt beide bestanden en
 * eist dezelfde uitkomst voor dezelfde reeks.
 */

export type SeriesPoint = { t: number; hr: number | null; spd: number | null };

/** Zone als letterlijk type, zodat de vertaalsleutels te controleren blijven. */
export type ZoneKey = '0' | '1' | '2' | '3' | '4' | '5';

export type ZoneEntry = { zone: ZoneKey; sec: number };
export type Zones = { entries: ZoneEntry[]; total: number; top: ZoneEntry };

export type Decoupling = { pct: number; band: 'good' | 'moderate' | 'high' };

/**
 * Kleur per zone. Dit zijn letterlijk de waarden uit `HR_ZONES`
 * (`src/lib/cardio-constants.ts`) en daarmee uit het merkpalet: mint, groen,
 * goud, oranje, koraal. Hiervóór had de grafiek een eigen setje tinten, zodat
 * zone 1 in een voorgeschreven blok mint was en in de zoneverdeling blauw.
 * De drift-check eist nu dat deze twee gelijk zijn.
 *
 * Sleutel '0' is de lichte band ónder zone 1 en hoort bij geen enkele zone;
 * die blijft grijs.
 */
export const ZONE_COLOR: Record<ZoneKey, string> = {
  '0': '#54726e',
  '1': '#9FCEC9',
  '2': '#5FD08A',
  '3': '#F5B942',
  '4': '#EE8447',
  '5': '#F0796C',
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Cardiac (aerobic) decoupling: splits de sessie in twee helften en vergelijkt
 * de efficiëntie (tempo ÷ HR) per helft. pct = hoeveel de efficiëntie daalt in
 * de 2e helft. <5% = goed gekoppeld, 5-10% = lichte drift, >10% = ontkoppeld.
 */
export function computeDecoupling(series: SeriesPoint[]): Decoupling | null {
  const pts = series.filter(
    (p): p is { t: number; hr: number; spd: number } => p.hr != null && p.spd != null && p.spd > 0,
  );
  if (pts.length < 6) return null;
  const mid = Math.floor(pts.length / 2);
  const ef = (arr: typeof pts) => {
    const h = mean(arr.map((p) => p.hr));
    return h > 0 ? mean(arr.map((p) => p.spd)) / h : 0;
  };
  const ef1 = ef(pts.slice(0, mid));
  const ef2 = ef(pts.slice(mid));
  if (ef1 <= 0) return null;
  const pct = Math.round(((ef1 - ef2) / ef1) * 1000) / 10;
  const band: Decoupling['band'] = pct < 5 ? 'good' : pct <= 10 ? 'moderate' : 'high';
  return { pct, band };
}

/** Tijd-in-zone omzetten naar wat er te tekenen valt; null als er niets in zit. */
export function readZones(tiz: Record<string, number> | null | undefined): Zones | null {
  if (!tiz) return null;
  const lees = (z: ZoneKey) => ({ zone: z, sec: Math.max(0, Number(tiz[z] ?? 0)) });

  // Zone 1 t/m 5 staan er ALTIJD, ook op nul. Alleen de geraakte zones tonen
  // laat zien wat je gedaan hebt maar niet wat je niet gedaan hebt, en dan
  // verspringt de lijst ook nog per training. Een lege zone 5 is informatie.
  const echt = (['1', '2', '3', '4', '5'] as const).map(lees);

  // Sleutel '0' is de lichte band ónder zone 1 (dagelijkse activiteit,
  // wandelen). Dat is géén zone, maar tijd die anders spoorloos is: bij een
  // wandeling van vijf uur bleef zonder deze regel anderhalf uur over. Alleen
  // tonen als er tijd in zit, want op nul zegt hij niets.
  const licht = lees('0');
  const entries = licht.sec > 0 ? [licht, ...echt] : echt;

  const total = entries.reduce((a, b) => a + b.sec, 0);
  if (total <= 0) return null;
  // De "meeste tijd"-zin gaat over echte zones; onder zone 1 is geen intensiteit.
  const top = echt.reduce((a, b) => (b.sec > a.sec ? b : a));
  return { entries, total, top };
}

/** Duur van een training als "42m" of "1u 12m". */
export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const rest = m % 60;
  // Een training van precies een uur leest "1u", niet "1u 0m".
  return rest === 0 ? `${Math.floor(m / 60)}u` : `${Math.floor(m / 60)}u ${rest}m`;
}
